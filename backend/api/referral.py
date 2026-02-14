"""
Referral API: get/generate referral code, stats
"""
import secrets
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from db.database import get_db
from db.models import User, Referral
from api.deps import get_current_user

router = APIRouter(prefix="/api/referral", tags=["referral"])


def _generate_code() -> str:
    return secrets.token_urlsafe(8)[:10].upper()


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
