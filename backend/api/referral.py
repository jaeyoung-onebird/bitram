"""
Referral API: get/generate referral code, stats, my-referrals
"""
import secrets
from pydantic import BaseModel
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from db.database import get_db
from db.models import User, Referral, Post, UserPoints
from api.deps import get_current_user
from core.points import compute_level

router = APIRouter(prefix="/api/referral", tags=["referral"])


def _generate_code() -> str:
    return secrets.token_urlsafe(8)[:10].upper()


class ReferredUserInfo(BaseModel):
    id: str
    nickname: str
    level: int = 1
    level_name: str = "석탄"
    post_count: int = 0
    joined_at: str
    milestones: dict = {}


@router.get("/my-code")
async def get_my_referral_code(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Generate referral code if not exists
    if not user.referral_code:
        user.referral_code = _generate_code()
        await db.commit()
        await db.refresh(user)

    return {
        "code": user.referral_code,
        "link": f"https://bitram.co.kr/register?ref={user.referral_code}",
    }


@router.get("/stats")
async def get_referral_stats(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(func.count())
        .select_from(Referral)
        .where(Referral.referrer_id == user.id)
    )
    total = (await db.execute(stmt)).scalar() or 0

    stmt = (
        select(func.count())
        .select_from(Referral)
        .where(Referral.referrer_id == user.id, Referral.rewarded == True)
    )
    rewarded = (await db.execute(stmt)).scalar() or 0

    return {
        "total_referrals": total,
        "rewarded": rewarded,
        "code": user.referral_code,
    }


@router.get("/my-referrals", response_model=list[ReferredUserInfo])
async def get_my_referrals(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all referred users with their activity stats and milestone status."""
    stmt = (
        select(Referral, User, UserPoints.total_points)
        .join(User, Referral.referred_id == User.id)
        .outerjoin(UserPoints, UserPoints.user_id == Referral.referred_id)
        .where(Referral.referrer_id == user.id)
        .order_by(Referral.created_at.desc())
    )
    result = await db.execute(stmt)
    rows = result.all()

    items = []
    for referral, referred_user, total_pts in rows:
        # Get post count for the referred user
        post_count = (await db.execute(
            select(func.count()).select_from(Post).where(Post.user_id == referred_user.id)
        )).scalar() or 0

        lv, lv_name = compute_level(total_pts or 0)

        items.append(ReferredUserInfo(
            id=str(referred_user.id),
            nickname=referred_user.nickname,
            level=lv,
            level_name=lv_name,
            post_count=post_count,
            joined_at=str(referred_user.created_at),
            milestones=referral.milestones_json or {},
        ))

    return items
