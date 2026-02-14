"""
Auth API: register, login, refresh, me, profile, password
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from db.database import get_db
from db.models import User, Referral, Post, Strategy, Bot, Trade
from api.deps import (
    hash_password, verify_password,
    create_access_token, create_refresh_token, decode_token,
    get_current_user,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    nickname: str
    referral_code: str | None = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str


class UserInfo(BaseModel):
    id: str
    email: str
    nickname: str
    plan: str

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
    telegram_chat_id: str | None
    created_at: str

    class Config:
        from_attributes = True


@router.post("/register", response_model=AuthResponse)
async def register(req: RegisterRequest, db: AsyncSession = Depends(get_db)):
    # Check existing
    stmt = select(User).where(User.email == req.email)
    result = await db.execute(stmt)
    if result.scalar_one_or_none():
        raise HTTPException(400, "이미 등록된 이메일입니다.")

    if len(req.password) < 8:
        raise HTTPException(400, "비밀번호는 8자 이상이어야 합니다.")

    user = User(
        email=req.email,
        password_hash=hash_password(req.password),
        nickname=req.nickname,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

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

    return AuthResponse(
        access_token=create_access_token(str(user.id)),
        refresh_token=create_refresh_token(str(user.id)),
        user=UserInfo(id=str(user.id), email=user.email, nickname=user.nickname, plan=user.plan),
    )


@router.post("/login", response_model=AuthResponse)
async def login(req: LoginRequest, db: AsyncSession = Depends(get_db)):
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

    return AuthResponse(
        access_token=create_access_token(str(user.id)),
        refresh_token=create_refresh_token(str(user.id)),
        user=UserInfo(id=str(user.id), email=user.email, nickname=user.nickname, plan=user.plan),
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh(req: RefreshRequest):
    payload = decode_token(req.refresh_token)
    if payload.get("type") != "refresh":
        raise HTTPException(401, "유효하지 않은 리프레시 토큰입니다.")

    user_id = payload["sub"]
    return TokenResponse(
        access_token=create_access_token(user_id),
        refresh_token=create_refresh_token(user_id),
    )


@router.get("/me", response_model=UserResponse)
async def me(user: User = Depends(get_current_user)):
    return UserResponse(
        id=str(user.id),
        email=user.email,
        nickname=user.nickname,
        plan=user.plan,
        telegram_chat_id=user.telegram_chat_id,
        created_at=str(user.created_at),
    )


class UpdateProfileRequest(BaseModel):
    nickname: str | None = None


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

    await db.commit()
    await db.refresh(user)
    return {
        "id": str(user.id),
        "email": user.email,
        "nickname": user.nickname,
        "plan": user.plan,
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
