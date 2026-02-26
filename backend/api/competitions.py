"""
Trading Competitions API
"""
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from uuid import UUID

from db.database import get_db
from db.models import User, Competition, CompetitionEntry, Trade
from api.deps import get_current_user

router = APIRouter(prefix="/api/competitions", tags=["competitions"])


class CompetitionCreateRequest(BaseModel):
    title: str
    description: str = ""
    start_date: str
    end_date: str
    prize_description: str = ""
    max_participants: int = 100


@router.get("")
async def list_competitions(
    status: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Competition).order_by(Competition.start_date.desc())

    now = datetime.now(timezone.utc)
    if status == "upcoming":
        stmt = stmt.where(Competition.start_date > now)
    elif status == "active":
        stmt = stmt.where(Competition.start_date <= now, Competition.end_date > now)
    elif status == "ended":
        stmt = stmt.where(Competition.end_date <= now)

    result = await db.execute(stmt)
    competitions = result.scalars().all()

    items = []
    for c in competitions:
        # Get participant count
        count_stmt = (
            select(func.count())
            .select_from(CompetitionEntry)
            .where(CompetitionEntry.competition_id == c.id)
        )
        participant_count = (await db.execute(count_stmt)).scalar() or 0

        # Determine status
        if now < c.start_date:
            comp_status = "upcoming"
        elif now > c.end_date:
            comp_status = "ended"
        else:
            comp_status = "active"

        items.append({
            "id": str(c.id),
            "title": c.title,
            "description": c.description,
            "start_date": str(c.start_date),
            "end_date": str(c.end_date),
            "status": comp_status,
            "prize_description": c.prize_description,
            "max_participants": c.max_participants,
            "participant_count": participant_count,
            "created_at": str(c.created_at),
        })

    return items


@router.post("/{competition_id}/join")
async def join_competition(
    competition_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    comp = await db.get(Competition, UUID(competition_id))
    if not comp:
        raise HTTPException(404, "대회를 찾을 수 없습니다.")

    now = datetime.now(timezone.utc)
    if now > comp.end_date:
        raise HTTPException(400, "이미 종료된 대회입니다.")

    # Check if already joined
    stmt = select(CompetitionEntry).where(
        CompetitionEntry.competition_id == comp.id,
        CompetitionEntry.user_id == user.id,
    )
    result = await db.execute(stmt)
    if result.scalar_one_or_none():
        raise HTTPException(400, "이미 참가한 대회입니다.")

    # Check max participants
    count_stmt = (
        select(func.count())
        .select_from(CompetitionEntry)
        .where(CompetitionEntry.competition_id == comp.id)
    )
    count = (await db.execute(count_stmt)).scalar() or 0
    if count >= comp.max_participants:
        raise HTTPException(400, "참가 인원이 가득 찼습니다.")

    entry = CompetitionEntry(
        competition_id=comp.id,
        user_id=user.id,
    )
    db.add(entry)
    await db.commit()

    return {"message": "대회에 참가했습니다."}


@router.get("/{competition_id}/leaderboard")
async def get_competition_leaderboard(
    competition_id: str,
    db: AsyncSession = Depends(get_db),
):
    comp = await db.get(Competition, UUID(competition_id))
    if not comp:
        raise HTTPException(404, "대회를 찾을 수 없습니다.")

    # Get all entries
    stmt = (
        select(CompetitionEntry, User.nickname)
        .join(User, CompetitionEntry.user_id == User.id)
        .where(CompetitionEntry.competition_id == comp.id)
    )
    result = await db.execute(stmt)
    entries = result.all()

    # Calculate profits from trades during competition period
    leaderboard = []
    for entry, nickname in entries:
        # Sum profits from sell trades during competition period
        profit_stmt = (
            select(
                func.coalesce(func.sum(Trade.profit), 0),
                func.count(Trade.id),
            )
            .where(
                Trade.user_id == entry.user_id,
                Trade.executed_at >= comp.start_date,
                Trade.executed_at <= comp.end_date,
                Trade.side == "sell",
            )
        )
        profit_result = await db.execute(profit_stmt)
        row = profit_result.one()
        profit_krw = float(row[0] or 0)
        trade_count = int(row[1] or 0)

        leaderboard.append({
            "user_id": str(entry.user_id),
            "nickname": nickname,
            "profit_krw": profit_krw,
            "trade_count": trade_count,
            "joined_at": str(entry.joined_at),
        })

    # Sort by profit descending
    leaderboard.sort(key=lambda x: x["profit_krw"], reverse=True)
    for rank, item in enumerate(leaderboard, 1):
        item["rank"] = rank

    return leaderboard


@router.post("")
async def create_competition(
    req: CompetitionCreateRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if user.plan != "admin":
        raise HTTPException(403, "관리자만 대회를 만들 수 있습니다.")

    comp = Competition(
        title=req.title,
        description=req.description,
        start_date=datetime.fromisoformat(req.start_date),
        end_date=datetime.fromisoformat(req.end_date),
        prize_description=req.prize_description,
        max_participants=req.max_participants,
    )
    db.add(comp)
    await db.commit()
    await db.refresh(comp)

    return {
        "id": str(comp.id),
        "title": comp.title,
        "message": "대회가 생성되었습니다.",
    }
