"""
Daily Quest API: get today's quests with progress, claim rewards.
"""
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from db.database import get_db
from db.models import User, UserPoints, PointLog, QuestClaim
from api.deps import get_current_user
from core.quest_engine import (
    DAILY_QUESTS,
    get_daily_quests_with_progress,
    get_quest_progress,
    get_claimed_quests,
)

router = APIRouter(prefix="/api/quests", tags=["quests"])

KST = timezone(timedelta(hours=9))


def _today_kst():
    return datetime.now(KST).date()


class QuestItem(BaseModel):
    id: str
    title: str
    description: str
    target: int
    current: int
    points: int
    completed: bool
    claimed: bool
    claimable: bool


class DailyQuestsResponse(BaseModel):
    quests: list[QuestItem]
    total_claimable: int
    total_claimed_today: int


class ClaimResponse(BaseModel):
    success: bool
    quest_id: str
    points_earned: int
    message: str


@router.get("/daily", response_model=DailyQuestsResponse)
async def get_daily_quests(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get today's quests with progress."""
    quests = await get_daily_quests_with_progress(db, user.id)

    total_claimable = sum(1 for q in quests if q["claimable"])
    total_claimed_today = sum(1 for q in quests if q["claimed"])

    return DailyQuestsResponse(
        quests=[QuestItem(**q) for q in quests],
        total_claimable=total_claimable,
        total_claimed_today=total_claimed_today,
    )


@router.post("/claim/{quest_id}", response_model=ClaimResponse)
async def claim_quest_reward(
    quest_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Claim quest reward when completed."""
    today = _today_kst()

    # Find the quest definition
    quest_def = None
    for q in DAILY_QUESTS:
        if q["id"] == quest_id:
            quest_def = q
            break

    if not quest_def:
        raise HTTPException(404, "존재하지 않는 퀘스트입니다.")

    if quest_def["points"] == 0:
        raise HTTPException(400, "이 퀘스트는 별도 보상이 없습니다.")

    # Check if already claimed today
    claimed = await get_claimed_quests(db, user.id)
    if quest_id in claimed:
        raise HTTPException(400, "이미 오늘 보상을 받았습니다.")

    # Check if quest is completed
    progress = await get_quest_progress(db, user.id)
    current = progress.get(quest_id, 0)
    if current < quest_def["target"]:
        raise HTTPException(400, "퀘스트가 아직 완료되지 않았습니다.")

    points = quest_def["points"]

    # Create claim record
    claim = QuestClaim(
        user_id=user.id,
        quest_id=quest_id,
        claimed_date=today,
        points_earned=points,
    )
    db.add(claim)

    # Award points
    stmt = select(UserPoints).where(UserPoints.user_id == user.id)
    user_points = (await db.execute(stmt)).scalar_one_or_none()

    if not user_points:
        user_points = UserPoints(user_id=user.id, total_points=0, level=1, login_streak=0)
        db.add(user_points)
        await db.flush()

    user_points.total_points = (user_points.total_points or 0) + points

    # Update level
    from core.points import compute_level
    user_points.level = compute_level(user_points.total_points)

    # Log points
    log = PointLog(
        user_id=user.id,
        action="quest_reward",
        points=points,
        description=f"퀘스트 보상: {quest_def['title']}",
    )
    db.add(log)

    await db.commit()

    return ClaimResponse(
        success=True,
        quest_id=quest_id,
        points_earned=points,
        message=f"퀘스트 '{quest_def['title']}' 보상 {points}포인트를 받았습니다!",
    )
