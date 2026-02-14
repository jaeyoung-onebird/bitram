"""
Points API: my points, history, leaderboard
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from db.database import get_db
from db.models import User, UserPoints, PointLog
from api.deps import get_current_user
from core.points import compute_level, next_level_info, LEVEL_THRESHOLDS

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

    return leaderboard
