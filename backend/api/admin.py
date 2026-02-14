"""
Admin API: basic admin dashboard stats
"""
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import get_current_admin
from db.database import get_db
from db.models import Bot, Comment, Post, Strategy, Trade, User

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.get("/overview")
async def admin_overview(
    _admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    now = datetime.now(timezone.utc)
    d7 = now - timedelta(days=7)

    users_total = (await db.execute(select(func.count()).select_from(User))).scalar_one()
    users_7d = (await db.execute(select(func.count()).select_from(User).where(User.created_at >= d7))).scalar_one()
    posts_total = (await db.execute(select(func.count()).select_from(Post))).scalar_one()
    comments_total = (await db.execute(select(func.count()).select_from(Comment))).scalar_one()
    strategies_total = (await db.execute(select(func.count()).select_from(Strategy))).scalar_one()
    bots_total = (await db.execute(select(func.count()).select_from(Bot))).scalar_one()
    active_bots = (
        await db.execute(select(func.count()).select_from(Bot).where(Bot.status == "running"))
    ).scalar_one()
    trades_total = (await db.execute(select(func.count()).select_from(Trade))).scalar_one()
    trades_7d = (
        await db.execute(select(func.count()).select_from(Trade).where(Trade.executed_at >= d7))
    ).scalar_one()

    recent_users_rows = (
        await db.execute(
            select(User.id, User.email, User.nickname, User.plan, User.created_at)
            .order_by(User.created_at.desc())
            .limit(12)
        )
    ).all()

    recent_posts_rows = (
        await db.execute(
            select(Post.id, Post.title, Post.category, Post.created_at, User.nickname)
            .join(User, User.id == Post.user_id)
            .order_by(Post.created_at.desc())
            .limit(12)
        )
    ).all()

    return {
        "counts": {
            "users_total": int(users_total or 0),
            "users_7d": int(users_7d or 0),
            "posts_total": int(posts_total or 0),
            "comments_total": int(comments_total or 0),
            "strategies_total": int(strategies_total or 0),
            "bots_total": int(bots_total or 0),
            "active_bots": int(active_bots or 0),
            "trades_total": int(trades_total or 0),
            "trades_7d": int(trades_7d or 0),
        },
        "recent_users": [
            {
                "id": str(r.id),
                "email": r.email,
                "nickname": r.nickname,
                "plan": r.plan,
                "created_at": str(r.created_at),
            }
            for r in recent_users_rows
        ],
        "recent_posts": [
            {
                "id": str(r.id),
                "title": r.title,
                "category": r.category,
                "author": r.nickname,
                "created_at": str(r.created_at),
            }
            for r in recent_posts_rows
        ],
    }
