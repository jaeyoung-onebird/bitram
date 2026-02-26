"""
OAuth2 social login: Google, Kakao
"""
import logging
import secrets
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from db.database import get_db
from db.models import User
from api.deps import hash_password, create_access_token, create_refresh_token
from config import get_settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth", tags=["oauth"])
settings = get_settings()

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo"

KAKAO_AUTH_URL = "https://kauth.kakao.com/oauth/authorize"
KAKAO_TOKEN_URL = "https://kauth.kakao.com/oauth/token"
KAKAO_USERINFO_URL = "https://kapi.kakao.com/v2/user/me"


def _google_redirect_uri():
    return f"{settings.BACKEND_URL}/api/auth/google/callback"


def _kakao_redirect_uri():
    return f"{settings.BACKEND_URL}/api/auth/kakao/callback"


@router.get("/google/login")
async def google_login():
    params = urlencode({
        "client_id": settings.GOOGLE_CLIENT_ID,
        "redirect_uri": _google_redirect_uri(),
        "response_type": "code",
        "scope": "openid email profile",
    })
    return RedirectResponse(f"{GOOGLE_AUTH_URL}?{params}")


@router.get("/google/callback")
async def google_callback(code: str = None, error: str = None, db: AsyncSession = Depends(get_db)):
    if error or not code:
        logger.warning("Google OAuth cancelled: error=%s, code=%s", error, bool(code))
        return RedirectResponse(f"{settings.FRONTEND_URL}/login?error=oauth_cancelled")

    async with httpx.AsyncClient() as client:
        token_res = await client.post(GOOGLE_TOKEN_URL, data={
            "code": code,
            "client_id": settings.GOOGLE_CLIENT_ID,
            "client_secret": settings.GOOGLE_CLIENT_SECRET,
            "redirect_uri": _google_redirect_uri(),
            "grant_type": "authorization_code",
        })
        token_data = token_res.json()
        if "access_token" not in token_data:
            logger.error("Google token exchange failed: %s", token_data)
            return RedirectResponse(f"{settings.FRONTEND_URL}/login?error=oauth_failed")

        userinfo_res = await client.get(GOOGLE_USERINFO_URL, headers={
            "Authorization": f"Bearer {token_data['access_token']}"
        })
        userinfo = userinfo_res.json()

    return await _process_oauth_login(
        db=db,
        provider="google",
        oauth_id=userinfo["sub"],
        email=userinfo.get("email"),
        nickname=userinfo.get("name", ""),
        avatar_url=userinfo.get("picture"),
    )


@router.get("/kakao/login")
async def kakao_login():
    params = urlencode({
        "client_id": settings.KAKAO_CLIENT_ID,
        "redirect_uri": _kakao_redirect_uri(),
        "response_type": "code",
    })
    return RedirectResponse(f"{KAKAO_AUTH_URL}?{params}")


@router.get("/kakao/callback")
async def kakao_callback(code: str = None, error: str = None, db: AsyncSession = Depends(get_db)):
    if error or not code:
        logger.warning("Kakao OAuth cancelled: error=%s, code=%s", error, bool(code))
        return RedirectResponse(f"{settings.FRONTEND_URL}/login?error=oauth_cancelled")

    async with httpx.AsyncClient() as client:
        redirect_uri = _kakao_redirect_uri()
        logger.info("Kakao token exchange: redirect_uri=%s", redirect_uri)
        token_res = await client.post(KAKAO_TOKEN_URL, data={
            "code": code,
            "client_id": settings.KAKAO_CLIENT_ID,
            "client_secret": settings.KAKAO_CLIENT_SECRET,
            "redirect_uri": redirect_uri,
            "grant_type": "authorization_code",
        }, headers={"Content-Type": "application/x-www-form-urlencoded"})
        token_data = token_res.json()
        if "access_token" not in token_data:
            logger.error("Kakao token exchange failed: %s", token_data)
            return RedirectResponse(f"{settings.FRONTEND_URL}/login?error=oauth_failed")

        userinfo_res = await client.get(KAKAO_USERINFO_URL, headers={
            "Authorization": f"Bearer {token_data['access_token']}"
        })
        userinfo = userinfo_res.json()

    kakao_account = userinfo.get("kakao_account", {})
    profile = kakao_account.get("profile", {})

    return await _process_oauth_login(
        db=db,
        provider="kakao",
        oauth_id=str(userinfo["id"]),
        email=kakao_account.get("email"),
        nickname=profile.get("nickname", ""),
        avatar_url=profile.get("profile_image_url"),
    )


async def _process_oauth_login(
    db: AsyncSession,
    provider: str,
    oauth_id: str,
    email: str | None,
    nickname: str,
    avatar_url: str | None,
):
    # 1. 이미 연결된 OAuth 계정 찾기
    stmt = select(User).where(User.oauth_provider == provider, User.oauth_id == oauth_id)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()

    # 2. 동일 이메일 계정이 있으면 연결
    if not user and email:
        stmt = select(User).where(User.email == email)
        result = await db.execute(stmt)
        user = result.scalar_one_or_none()
        if user:
            user.oauth_provider = provider
            user.oauth_id = oauth_id

    # 3. 신규 유저 생성
    if not user:
        base_nickname = (nickname or f"user_{oauth_id[:8]}")[:20]
        unique_nickname = base_nickname
        suffix = 1
        while True:
            stmt = select(User).where(User.nickname == unique_nickname)
            res = await db.execute(stmt)
            if not res.scalar_one_or_none():
                break
            unique_nickname = f"{base_nickname}{suffix}"
            suffix += 1

        has_real_email = bool(email)
        user = User(
            email=email or f"{provider}_{oauth_id}@oauth.local",
            password_hash=hash_password(secrets.token_hex(32)),
            nickname=unique_nickname,
            oauth_provider=provider,
            oauth_id=oauth_id,
            avatar_url=avatar_url,
            email_verified=has_real_email,
        )
        db.add(user)
        await db.flush()

    await db.commit()
    await db.refresh(user)

    # JWT 발급 후 쿠키 설정, 프론트엔드로 리다이렉트
    access_token = create_access_token(str(user.id))
    refresh_token = create_refresh_token(str(user.id))

    is_prod = settings.APP_ENV == "production"
    response = RedirectResponse(url=f"{settings.FRONTEND_URL}/auth/callback", status_code=302)
    response.set_cookie(
        "bitram_access_token", access_token,
        httponly=True, secure=is_prod, samesite="lax", max_age=86400, path="/",
    )
    response.set_cookie(
        "bitram_refresh_token", refresh_token,
        httponly=True, secure=is_prod, samesite="lax", max_age=604800, path="/",
    )
    return response
