"""
Onboarding API: check progress for new user checklist
"""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from db.database import get_db
from db.models import User, Strategy, Post, Follow, ExchangeKey
from api.deps import get_current_user

router = APIRouter(prefix="/api/onboarding", tags=["onboarding"])


@router.get("/status")
async def get_onboarding_status(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    uid = user.id

    # 1. first_strategy
    stmt = select(func.count()).select_from(Strategy).where(Strategy.user_id == uid)
    first_strategy = (await db.execute(stmt)).scalar() or 0

    # 2. first_backtest
    stmt = (
        select(func.count())
        .select_from(Strategy)
        .where(Strategy.user_id == uid, Strategy.backtest_result.isnot(None))
    )
    first_backtest = (await db.execute(stmt)).scalar() or 0

    # 3. first_post
    stmt = select(func.count()).select_from(Post).where(Post.user_id == uid)
    first_post = (await db.execute(stmt)).scalar() or 0

    # 4. first_follow
    stmt = select(func.count()).select_from(Follow).where(Follow.follower_id == uid)
    first_follow = (await db.execute(stmt)).scalar() or 0

    # 5. api_key_added
    stmt = select(func.count()).select_from(ExchangeKey).where(ExchangeKey.user_id == uid)
    api_key_added = (await db.execute(stmt)).scalar() or 0

    steps = {
        "first_strategy": first_strategy > 0,
        "first_backtest": first_backtest > 0,
        "first_post": first_post > 0,
        "first_follow": first_follow > 0,
        "api_key_added": api_key_added > 0,
    }
    completed = sum(1 for v in steps.values() if v)

    return {
        "steps": steps,
        "completed": completed,
        "total": 5,
    }
