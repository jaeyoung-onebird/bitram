"""
Auth API: register, login, refresh, me, profile, password,
           email verification, password reset
"""
import secrets
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, EmailStr
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from db.database import get_db
from db.models import User, Referral, Post, Strategy, Bot, Trade, Badge, Follow, UserPoints
from api.deps import (
    hash_password, verify_password,
    create_access_token, create_refresh_token, decode_token,
    get_current_user,
)
from core.points import compute_level, next_level_info
from middleware.rate_limit import rate_limit
from config import get_settings

router = APIRouter(prefix="/api/auth", tags=["auth"])
settings = get_settings()


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    nickname: str
    referral_code: str | None = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str | None = None


class UserInfo(BaseModel):
    id: str
    email: str
    nickname: str
    plan: str
    email_verified: bool = False
    role: str = "user"
    avatar_url: str | None = None
    bio: str | None = None
    social_links: dict | None = None

class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"

class AuthResponse(TokenResponse):
    user: UserInfo


class UserResponse(BaseModel):
    id: str
    email: str
    nickname: str
    plan: str
    email_verified: bool
    role: str
    avatar_url: str | None
    bio: str | None
    social_links: dict | None
    telegram_chat_id: str | None
    created_at: str

    class Config:
        from_attributes = True


def _user_info(user: User) -> UserInfo:
    return UserInfo(
        id=str(user.id),
        email=user.email,
        nickname=user.nickname,
        plan=user.plan,
        email_verified=user.email_verified or False,
        role=user.role or "user",
        avatar_url=user.avatar_url,
        bio=user.bio,
        social_links=user.social_links,
    )


def _set_auth_cookies(response: Response, access_token: str, refresh_token: str):
    secure = settings.APP_ENV != "development"
    response.set_cookie(
        key="bitram_access_token",
        value=access_token,
        httponly=True,
        secure=secure,
        samesite="lax",
        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        path="/",
    )
    response.set_cookie(
        key="bitram_refresh_token",
        value=refresh_token,
        httponly=True,
        secure=secure,
        samesite="lax",
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400,
        path="/",
    )


def _clear_auth_cookies(response: Response):
    response.delete_cookie("bitram_access_token", path="/")
    response.delete_cookie("bitram_refresh_token", path="/")


@router.post("/register", response_model=AuthResponse)
@rate_limit(max_calls=3, period=60, key_func="ip")
async def register(
    req: RegisterRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    # Check existing
    stmt = select(User).where(User.email == req.email)
    result = await db.execute(stmt)
    if result.scalar_one_or_none():
        raise HTTPException(400, "이미 등록된 이메일입니다.")

    if len(req.password) < 8:
        raise HTTPException(400, "비밀번호는 8자 이상이어야 합니다.")

    # Generate email verification token
    verify_token = secrets.token_urlsafe(64)

    user = User(
        email=req.email,
        password_hash=hash_password(req.password),
        nickname=req.nickname,
        email_verify_token=verify_token,
        email_verify_expires=datetime.now(timezone.utc) + timedelta(hours=24),
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    # Send verification email via Celery
    try:
        from tasks.email_tasks import send_verification_email_task
        send_verification_email_task.delay(user.email, verify_token, user.nickname)
    except Exception:
        pass

    # Handle referral
    if req.referral_code:
        try:
            from core.points import award_points
            ref_stmt = select(User).where(User.referral_code == req.referral_code)
            ref_result = await db.execute(ref_stmt)
            referrer = ref_result.scalar_one_or_none()
            if referrer and referrer.id != user.id:
                referral = Referral(
                    referrer_id=referrer.id,
                    referred_id=user.id,
                    code=req.referral_code,
                    rewarded=True,
                )
                db.add(referral)
                await award_points(db, referrer.id, "referral_inviter", f"{user.nickname}님 초대")
                await award_points(db, user.id, "referral_invitee", f"{referrer.nickname}님의 초대로 가입")
                await db.commit()
        except Exception:
            pass

    access_token = create_access_token(str(user.id))
    refresh_token = create_refresh_token(str(user.id))
    _set_auth_cookies(response, access_token, refresh_token)
    return AuthResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=_user_info(user),
    )


@router.post("/login", response_model=AuthResponse)
@rate_limit(max_calls=5, period=60, key_func="ip")
async def login(
    req: LoginRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    stmt = select(User).where(User.email == req.email)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()

    if not user or not verify_password(req.password, user.password_hash):
        raise HTTPException(401, "이메일 또는 비밀번호가 올바르지 않습니다.")

    # Award daily login points (KST-based)
    try:
        from core.points import award_points, check_and_award_streak
        await award_points(db, user.id, "login", "일일 로그인 보너스")
        await check_and_award_streak(db, user.id)
        await db.commit()
    except Exception:
        pass

    access_token = create_access_token(str(user.id))
    refresh_token = create_refresh_token(str(user.id))
    _set_auth_cookies(response, access_token, refresh_token)
    return AuthResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=_user_info(user),
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh(request: Request, response: Response, req: RefreshRequest = None):
    refresh_token = (req.refresh_token if req else None) or request.cookies.get("bitram_refresh_token")
    if not refresh_token:
        raise HTTPException(401, "리프레시 토큰이 없습니다.")

    payload = decode_token(refresh_token)
    if payload.get("type") != "refresh":
        raise HTTPException(401, "유효하지 않은 리프레시 토큰입니다.")

    user_id = payload["sub"]
    access_token = create_access_token(user_id)
    new_refresh_token = create_refresh_token(user_id)
    _set_auth_cookies(response, access_token, new_refresh_token)
    return TokenResponse(
        access_token=access_token,
        refresh_token=new_refresh_token,
    )


@router.post("/logout")
async def logout():
    response = {"ok": True}
    from fastapi.responses import JSONResponse
    res = JSONResponse(content=response)
    _clear_auth_cookies(res)
    return res


@router.post("/ws-token")
async def issue_ws_token(user: User = Depends(get_current_user)):
    return {"access_token": create_access_token(str(user.id))}


@router.get("/me", response_model=UserResponse)
async def me(user: User = Depends(get_current_user)):
    return UserResponse(
        id=str(user.id),
        email=user.email,
        nickname=user.nickname,
        plan=user.plan,
        email_verified=user.email_verified or False,
        role=user.role or "user",
        avatar_url=user.avatar_url,
        bio=user.bio,
        social_links=user.social_links,
        telegram_chat_id=user.telegram_chat_id,
        created_at=str(user.created_at),
    )


class UpdateProfileRequest(BaseModel):
    nickname: str | None = None
    avatar_url: str | None = None
    bio: str | None = None
    social_links: dict | None = None


@router.patch("/profile")
async def update_profile(
    req: UpdateProfileRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if req.nickname is not None:
        nick = req.nickname.strip()
        if not nick or len(nick) > 50:
            raise HTTPException(400, "닉네임은 1~50자여야 합니다.")
        # Check duplicate
        dup = await db.execute(
            select(User).where(User.nickname == nick, User.id != user.id)
        )
        if dup.scalar_one_or_none():
            raise HTTPException(400, "이미 사용 중인 닉네임입니다.")
        user.nickname = nick

    if req.avatar_url is not None:
        user.avatar_url = req.avatar_url[:500] if req.avatar_url else None

    if req.bio is not None:
        user.bio = req.bio[:200] if req.bio else None

    if req.social_links is not None:
        user.social_links = req.social_links

    await db.commit()
    await db.refresh(user)
    return {
        "id": str(user.id),
        "email": user.email,
        "nickname": user.nickname,
        "plan": user.plan,
        "avatar_url": user.avatar_url,
        "bio": user.bio,
        "social_links": user.social_links,
    }


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


@router.patch("/password")
async def change_password(
    req: ChangePasswordRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not verify_password(req.current_password, user.password_hash):
        raise HTTPException(400, "현재 비밀번호가 올바르지 않습니다.")
    if len(req.new_password) < 8:
        raise HTTPException(400, "새 비밀번호는 8자 이상이어야 합니다.")
    if req.current_password == req.new_password:
        raise HTTPException(400, "현재 비밀번호와 다른 비밀번호를 입력해주세요.")

    user.password_hash = hash_password(req.new_password)
    await db.commit()
    return {"ok": True, "message": "비밀번호가 변경되었습니다."}


# ─── Email Verification ───────────────────────────────────────────────────

class VerifyEmailRequest(BaseModel):
    token: str


@router.post("/verify-email")
async def verify_email(req: VerifyEmailRequest, db: AsyncSession = Depends(get_db)):
    stmt = select(User).where(User.email_verify_token == req.token)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(400, "유효하지 않은 인증 토큰입니다.")

    if user.email_verify_expires and user.email_verify_expires < datetime.now(timezone.utc):
        raise HTTPException(400, "인증 링크가 만료되었습니다. 재발송을 요청해주세요.")

    user.email_verified = True
    user.email_verify_token = None
    user.email_verify_expires = None
    await db.commit()

    return {"ok": True, "message": "이메일 인증이 완료되었습니다."}


@router.post("/resend-verification")
async def resend_verification(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if user.email_verified:
        raise HTTPException(400, "이미 인증된 이메일입니다.")

    verify_token = secrets.token_urlsafe(64)
    user.email_verify_token = verify_token
    user.email_verify_expires = datetime.now(timezone.utc) + timedelta(hours=24)
    await db.commit()

    try:
        from tasks.email_tasks import send_verification_email_task
        send_verification_email_task.delay(user.email, verify_token, user.nickname)
    except Exception:
        pass

    return {"ok": True, "message": "인증 이메일을 재발송했습니다."}


# ─── Password Reset ───────────────────────────────────────────────────────

class ForgotPasswordRequest(BaseModel):
    email: EmailStr


@router.post("/forgot-password")
@rate_limit(max_calls=3, period=60, key_func="ip")
async def forgot_password(req: ForgotPasswordRequest, request: Request, db: AsyncSession = Depends(get_db)):
    stmt = select(User).where(User.email == req.email)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()

    # Always return success to prevent email enumeration
    if not user:
        return {"ok": True, "message": "이메일이 존재하면 재설정 링크가 발송됩니다."}

    reset_token = secrets.token_urlsafe(64)
    user.password_reset_token = reset_token
    user.password_reset_expires = datetime.now(timezone.utc) + timedelta(hours=1)
    await db.commit()

    try:
        from tasks.email_tasks import send_password_reset_email_task
        send_password_reset_email_task.delay(user.email, reset_token, user.nickname)
    except Exception:
        pass

    return {"ok": True, "message": "이메일이 존재하면 재설정 링크가 발송됩니다."}


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str


@router.post("/reset-password")
async def reset_password(req: ResetPasswordRequest, db: AsyncSession = Depends(get_db)):
    if len(req.new_password) < 8:
        raise HTTPException(400, "새 비밀번호는 8자 이상이어야 합니다.")

    stmt = select(User).where(User.password_reset_token == req.token)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(400, "유효하지 않은 재설정 토큰입니다.")

    if user.password_reset_expires and user.password_reset_expires < datetime.now(timezone.utc):
        raise HTTPException(400, "재설정 링크가 만료되었습니다.")

    user.password_hash = hash_password(req.new_password)
    user.password_reset_token = None
    user.password_reset_expires = None
    await db.commit()

    return {"ok": True, "message": "비밀번호가 성공적으로 변경되었습니다."}


@router.get("/my-stats")
async def my_stats(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    post_count = (await db.execute(
        select(func.count()).select_from(Post).where(Post.user_id == user.id)
    )).scalar() or 0

    strategy_count = (await db.execute(
        select(func.count()).select_from(Strategy).where(Strategy.user_id == user.id)
    )).scalar() or 0

    bot_count = (await db.execute(
        select(func.count()).select_from(Bot).where(Bot.user_id == user.id)
    )).scalar() or 0

    trade_count = (await db.execute(
        select(func.count()).select_from(Trade).where(Trade.user_id == user.id)
    )).scalar() or 0

    return {
        "post_count": post_count,
        "strategy_count": strategy_count,
        "bot_count": bot_count,
        "trade_count": trade_count,
        "plan": user.plan,
        "created_at": str(user.created_at),
    }


# ─── Public Profile by Nickname ─────────────────────────────────────────────

class PublicBadgeInfo(BaseModel):
    type: str
    label: str

class PublicPostItem(BaseModel):
    id: str
    title: str
    category: str
    like_count: int
    comment_count: int
    created_at: str

class PublicProfileResponse(BaseModel):
    nickname: str
    avatar_url: str | None = None
    bio: str | None = None
    social_links: dict | None = None
    level: int = 1
    level_name: str = "석탄"
    level_color: str = "#6B7280"
    badges: list[PublicBadgeInfo] = []
    recent_posts: list[PublicPostItem] = []
    stats: dict = {}
    join_date: str


# Level color mapping
LEVEL_COLORS = {
    1: "#6B7280",    # 석탄 - gray
    2: "#9CA3AF",    # 아이언 - iron gray
    3: "#CD7F32",    # 브론즈 - bronze
    4: "#C0C0C0",    # 실버 - silver
    5: "#FFD700",    # 골드 - gold
    6: "#00CED1",    # 플래티넘 - teal
    7: "#0F52BA",    # 사파이어 - sapphire blue
    8: "#E0115F",    # 루비 - ruby red
    9: "#50C878",    # 에메랄드 - emerald green
    10: "#B9F2FF",   # 다이아몬드 - diamond
}


@router.get("/user/{nickname}", response_model=PublicProfileResponse)
async def get_public_profile(
    nickname: str,
    db: AsyncSession = Depends(get_db),
):
    """
    Get a user's public profile by nickname. No authentication required.
    Returns: nickname, avatar_url, bio, social_links, level, badges,
    recent_posts (5), stats, join_date.
    """
    # Find user by nickname
    stmt = select(User).where(User.nickname == nickname)
    result = await db.execute(stmt)
    target_user = result.scalar_one_or_none()
    if not target_user:
        raise HTTPException(404, "사용자를 찾을 수 없습니다.")

    uid = target_user.id

    # Level & Points
    up = (await db.execute(
        select(UserPoints).where(UserPoints.user_id == uid)
    )).scalar_one_or_none()
    tp = up.total_points if up else 0
    lv, lv_name = compute_level(tp)
    level_color = LEVEL_COLORS.get(lv, "#6B7280")

    # Badges
    badge_stmt = select(Badge).where(Badge.user_id == uid)
    badge_rows = (await db.execute(badge_stmt)).scalars().all()
    badges = [PublicBadgeInfo(type=b.type, label=b.label) for b in badge_rows]

    # Recent posts (last 5)
    posts_stmt = (
        select(Post)
        .where(Post.user_id == uid)
        .order_by(Post.created_at.desc())
        .limit(5)
    )
    posts_rows = (await db.execute(posts_stmt)).scalars().all()
    recent_posts = [
        PublicPostItem(
            id=str(p.id),
            title=p.title,
            category=p.category,
            like_count=p.like_count,
            comment_count=p.comment_count,
            created_at=str(p.created_at),
        )
        for p in posts_rows
    ]

    # Stats
    post_count = (await db.execute(
        select(func.count()).select_from(Post).where(Post.user_id == uid)
    )).scalar() or 0

    total_likes = (await db.execute(
        select(func.coalesce(func.sum(Post.like_count), 0)).where(Post.user_id == uid)
    )).scalar() or 0

    follower_count = (await db.execute(
        select(func.count()).select_from(Follow).where(Follow.following_id == uid)
    )).scalar() or 0

    following_count = (await db.execute(
        select(func.count()).select_from(Follow).where(Follow.follower_id == uid)
    )).scalar() or 0

    stats = {
        "post_count": post_count,
        "follower_count": follower_count,
        "following_count": following_count,
        "total_likes_received": total_likes,
    }

    return PublicProfileResponse(
        nickname=target_user.nickname,
        avatar_url=target_user.avatar_url,
        bio=target_user.bio,
        social_links=target_user.social_links,
        level=lv,
        level_name=lv_name,
        level_color=level_color,
        badges=badges,
        recent_posts=recent_posts,
        stats=stats,
        join_date=str(target_user.created_at),
    )
