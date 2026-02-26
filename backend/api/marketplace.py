"""
Strategy Marketplace API
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from db.database import get_db
from db.models import User, Strategy

router = APIRouter(prefix="/api/marketplace", tags=["marketplace"])


@router.get("")
async def list_marketplace(
    pair: str | None = None,
    timeframe: str | None = None,
    sort: str = Query("copies", pattern="^(copies|newest|profit)$"),
    search: str | None = None,
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(Strategy, User.nickname)
        .join(User, Strategy.user_id == User.id)
        .where(Strategy.is_public == True)
    )

    if pair:
        stmt = stmt.where(Strategy.pair == pair)
    if timeframe:
        stmt = stmt.where(Strategy.timeframe == timeframe)
    if search:
        stmt = stmt.where(Strategy.name.ilike(f"%{search}%"))

    if sort == "newest":
        stmt = stmt.order_by(Strategy.created_at.desc())
    elif sort == "profit":
        # Sort by backtest return pct (nulls last)
        stmt = stmt.order_by(
            func.coalesce(
                Strategy.backtest_result["total_return_pct"].as_float(), 0
            ).desc()
        )
    else:  # copies
        stmt = stmt.order_by(Strategy.copy_count.desc())

    stmt = stmt.offset((page - 1) * size).limit(size)
    result = await db.execute(stmt)
    rows = result.all()

    items = []
    for s, nickname in rows:
        bt = s.backtest_result or {}
        items.append({
            "id": str(s.id),
            "name": s.name,
            "description": s.description,
            "pair": s.pair,
            "timeframe": s.timeframe,
            "is_public": s.is_public,
            "copy_count": s.copy_count or 0,
            "author_nickname": nickname,
            "author_id": str(s.user_id),
            "backtest_summary": {
                "total_return_pct": bt.get("total_return_pct"),
                "win_rate": bt.get("win_rate"),
                "total_trades": bt.get("total_trades"),
                "max_drawdown_pct": bt.get("max_drawdown_pct"),
            } if bt else None,
            "created_at": str(s.created_at),
        })

    # Total count for pagination
    count_stmt = (
        select(func.count())
        .select_from(Strategy)
        .where(Strategy.is_public == True)
    )
    if pair:
        count_stmt = count_stmt.where(Strategy.pair == pair)
    if timeframe:
        count_stmt = count_stmt.where(Strategy.timeframe == timeframe)
    if search:
        count_stmt = count_stmt.where(Strategy.name.ilike(f"%{search}%"))
    total = (await db.execute(count_stmt)).scalar() or 0

    return {"items": items, "total": total, "page": page, "size": size}
