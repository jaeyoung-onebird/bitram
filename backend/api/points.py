"""
Points API: my points, history, leaderboard
"""
import json as _json
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from db.database import get_db
from db.models import User, UserPoints, PointLog
from api.deps import get_current_user
from core.points import compute_level, next_level_info, LEVEL_THRESHOLDS
from core.redis_cache import cache_get, cache_set

router = APIRouter(prefix="/api/points", tags=["points"])


@router.get("/me")
async def get_my_points(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(UserPoints).where(UserPoints.user_id == user.id)
    result = await db.execute(stmt)
    up = result.scalar_one_or_none()

    if not up:
        return {
            "total_points": 0,
            "level": 1,
            "level_name": "씨앗",
            "login_streak": 0,
            "last_login_date": None,
            **next_level_info(0),
        }

    level_num, level_name = compute_level(up.total_points or 0)
    return {
        "total_points": up.total_points or 0,
        "level": level_num,
        "level_name": level_name,
        "login_streak": up.login_streak or 0,
        "last_login_date": str(up.last_login_date) if up.last_login_date else None,
        **next_level_info(up.total_points or 0),
    }


@router.get("/history")
async def get_point_history(
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=50),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(PointLog)
        .where(PointLog.user_id == user.id)
        .order_by(PointLog.created_at.desc())
        .offset((page - 1) * size)
        .limit(size)
    )
    result = await db.execute(stmt)
    logs = result.scalars().all()

    return [
        {
            "id": str(log.id),
            "action": log.action,
            "points": log.points,
            "description": log.description,
            "created_at": str(log.created_at),
        }
        for log in logs
    ]


@router.get("/leaderboard")
async def get_leaderboard(
    db: AsyncSession = Depends(get_db),
):
    """Leaderboard cached for 10 minutes."""
    cached = await cache_get("points:leaderboard")
    if cached:
        return _json.loads(cached)

    stmt = (
        select(UserPoints, User.nickname)
        .join(User, UserPoints.user_id == User.id)
        .order_by(UserPoints.total_points.desc())
        .limit(20)
    )
    result = await db.execute(stmt)
    rows = result.all()

    leaderboard = []
    for rank, (up, nickname) in enumerate(rows, 1):
        level_num, level_name = compute_level(up.total_points or 0)
        leaderboard.append({
            "rank": rank,
            "user_id": str(up.user_id),
            "nickname": nickname,
            "total_points": up.total_points or 0,
            "level": level_num,
            "level_name": level_name,
        })

    await cache_set("points:leaderboard", _json.dumps(leaderboard), ttl=600)
    return leaderboard


@router.get("/level-info")
async def get_level_info(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Returns detailed level info including progress to next level,
    color, perks, and the full level config table.
    """
    from core.level_config import get_level_progress, get_level_for_points, get_all_levels

    stmt = select(UserPoints).where(UserPoints.user_id == user.id)
    up = (await db.execute(stmt)).scalar_one_or_none()

    total_points = up.total_points if up else 0
    current_level = get_level_for_points(total_points)
    progress = get_level_progress(total_points, current_level)
    all_levels = get_all_levels()

    return {
        "current": progress,
        "all_levels": all_levels,
    }
