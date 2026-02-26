"""
Strategy Marketplace API
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from uuid import UUID

from db.database import get_db
from db.models import User, Strategy, StrategyReview
from api.deps import get_current_user

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


# ─── Strategy Reviews ────────────────────────────────────────────────────────

class ReviewRequest(BaseModel):
    rating: int  # 1~5
    comment: str = ""


@router.get("/{strategy_id}/reviews")
async def get_reviews(
    strategy_id: str,
    db: AsyncSession = Depends(get_db),
):
    sid = UUID(strategy_id)
    stmt = (
        select(StrategyReview, User.nickname)
        .join(User, StrategyReview.user_id == User.id)
        .where(StrategyReview.strategy_id == sid)
        .order_by(StrategyReview.created_at.desc())
    )
    rows = (await db.execute(stmt)).all()

    avg_stmt = select(func.avg(StrategyReview.rating)).where(StrategyReview.strategy_id == sid)
    avg_rating = (await db.execute(avg_stmt)).scalar()

    reviews = []
    for review, nickname in rows:
        reviews.append({
            "id": str(review.id),
            "user_id": str(review.user_id),
            "nickname": nickname,
            "rating": review.rating,
            "comment": review.comment or "",
            "created_at": str(review.created_at),
        })
    return {
        "reviews": reviews,
        "avg_rating": round(float(avg_rating), 1) if avg_rating else None,
        "count": len(reviews),
    }


@router.post("/{strategy_id}/reviews")
async def create_review(
    strategy_id: str,
    body: ReviewRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not 1 <= body.rating <= 5:
        raise HTTPException(400, "별점은 1~5 사이여야 합니다.")

    sid = UUID(strategy_id)
    strategy = (await db.execute(select(Strategy).where(Strategy.id == sid))).scalar_one_or_none()
    if not strategy:
        raise HTTPException(404, "전략을 찾을 수 없습니다.")
    if strategy.user_id == user.id:
        raise HTTPException(400, "자신의 전략에는 리뷰를 남길 수 없습니다.")

    existing = (await db.execute(
        select(StrategyReview).where(
            StrategyReview.strategy_id == sid,
            StrategyReview.user_id == user.id,
        )
    )).scalar_one_or_none()

    if existing:
        existing.rating = body.rating
        existing.comment = body.comment.strip()[:500] if body.comment else ""
    else:
        db.add(StrategyReview(
            strategy_id=sid,
            user_id=user.id,
            rating=body.rating,
            comment=body.comment.strip()[:500] if body.comment else "",
        ))
    await db.commit()
    return {"ok": True}
