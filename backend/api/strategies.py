"""
Strategies API: CRUD, backtest, duplicate, indicators list
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from uuid import UUID
from typing import Optional

from db.database import get_db
from db.models import User, Strategy, Bot
from api.deps import get_current_user, get_plan_limits
from core.strategy_engine import validate_strategy_config, get_available_indicators

router = APIRouter(prefix="/api/strategies", tags=["strategies"])


class StrategyCreateRequest(BaseModel):
    name: str
    description: str = ""
    pair: str
    timeframe: str
    config_json: dict
    is_public: bool = False


class StrategyUpdateRequest(BaseModel):
    name: str | None = None
    description: str | None = None
    pair: str | None = None
    timeframe: str | None = None
    config_json: dict | None = None
    is_public: bool | None = None


class StrategyResponse(BaseModel):
    id: str
    name: str
    description: str
    pair: str
    timeframe: str
    config_json: dict
    is_public: bool
    backtest_result: dict | None
    copy_count: int
    user_nickname: str | None = None
    created_at: str
    updated_at: str


@router.get("/indicators")
async def list_indicators():
    """사용 가능한 지표 목록"""
    return get_available_indicators()


@router.post("", response_model=StrategyResponse)
async def create_strategy(
    req: StrategyCreateRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Check plan limits
    limits = get_plan_limits(user.plan)
    if limits["max_strategies"] > 0:
        stmt = select(func.count()).select_from(Strategy).where(Strategy.user_id == user.id)
        result = await db.execute(stmt)
        count = result.scalar()
        if count >= limits["max_strategies"]:
            raise HTTPException(403, f"현재 플랜의 전략 수 한도({limits['max_strategies']}개)에 도달했습니다.")

    # Validate config
    errors = validate_strategy_config(req.config_json)
    if errors:
        raise HTTPException(400, detail={"errors": errors})

    strategy = Strategy(
        user_id=user.id,
        name=req.name,
        description=req.description,
        pair=req.pair,
        timeframe=req.timeframe,
        config_json=req.config_json,
        is_public=req.is_public,
    )
    db.add(strategy)
    await db.commit()
    await db.refresh(strategy)

    return _to_response(strategy, user.nickname)


@router.get("", response_model=list[StrategyResponse])
async def list_strategies(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Strategy).where(Strategy.user_id == user.id).order_by(Strategy.updated_at.desc())
    result = await db.execute(stmt)
    strategies = result.scalars().all()
    return [_to_response(s, user.nickname) for s in strategies]


@router.get("/public", response_model=list[StrategyResponse])
async def list_public_strategies(
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(Strategy, User.nickname)
        .join(User, Strategy.user_id == User.id)
        .where(Strategy.is_public == True)
        .order_by(Strategy.copy_count.desc())
        .offset((page - 1) * size)
        .limit(size)
    )
    result = await db.execute(stmt)
    rows = result.all()
    return [_to_response(s, nick) for s, nick in rows]


@router.get("/{strategy_id}", response_model=StrategyResponse)
async def get_strategy(
    strategy_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    strategy = await _get_user_strategy(strategy_id, user.id, db)
    return _to_response(strategy, user.nickname)


@router.put("/{strategy_id}", response_model=StrategyResponse)
async def update_strategy(
    strategy_id: str,
    req: StrategyUpdateRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    strategy = await _get_user_strategy(strategy_id, user.id, db)

    if req.name is not None:
        strategy.name = req.name
    if req.description is not None:
        strategy.description = req.description
    if req.pair is not None:
        strategy.pair = req.pair
    if req.timeframe is not None:
        strategy.timeframe = req.timeframe
    if req.config_json is not None:
        errors = validate_strategy_config(req.config_json)
        if errors:
            raise HTTPException(400, detail={"errors": errors})
        strategy.config_json = req.config_json
    if req.is_public is not None:
        strategy.is_public = req.is_public

    await db.commit()
    await db.refresh(strategy)
    return _to_response(strategy, user.nickname)


@router.delete("/{strategy_id}")
async def delete_strategy(
    strategy_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    strategy = await _get_user_strategy(strategy_id, user.id, db)

    # Check if any running bot uses this strategy
    stmt = select(Bot).where(Bot.strategy_id == strategy.id, Bot.status == "running")
    result = await db.execute(stmt)
    if result.scalar_one_or_none():
        raise HTTPException(400, "실행 중인 봇이 이 전략을 사용하고 있어 삭제할 수 없습니다.")

    await db.delete(strategy)
    await db.commit()
    return {"message": "삭제되었습니다."}


@router.post("/{strategy_id}/duplicate", response_model=StrategyResponse)
async def duplicate_strategy(
    strategy_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Copy a strategy (own or public) to user's strategies."""
    stmt = select(Strategy).where(Strategy.id == UUID(strategy_id))
    result = await db.execute(stmt)
    original = result.scalar_one_or_none()
    if not original:
        raise HTTPException(404, "전략을 찾을 수 없습니다.")
    if original.user_id != user.id and not original.is_public:
        raise HTTPException(403, "비공개 전략은 복사할 수 없습니다.")

    new_strategy = Strategy(
        user_id=user.id,
        name=f"{original.name} (복사본)",
        description=original.description,
        pair=original.pair,
        timeframe=original.timeframe,
        config_json=original.config_json,
    )
    db.add(new_strategy)

    # Increment copy count
    original.copy_count = (original.copy_count or 0) + 1

    await db.commit()
    await db.refresh(new_strategy)
    return _to_response(new_strategy, user.nickname)


# ─── Helpers ─────────────────────────────────────────────────────────────────

async def _get_user_strategy(strategy_id: str, user_id, db: AsyncSession) -> Strategy:
    stmt = select(Strategy).where(Strategy.id == UUID(strategy_id), Strategy.user_id == user_id)
    result = await db.execute(stmt)
    strategy = result.scalar_one_or_none()
    if not strategy:
        raise HTTPException(404, "전략을 찾을 수 없습니다.")
    return strategy


def _to_response(s: Strategy, nickname: str = None) -> StrategyResponse:
    return StrategyResponse(
        id=str(s.id), name=s.name, description=s.description,
        pair=s.pair, timeframe=s.timeframe, config_json=s.config_json,
        is_public=s.is_public, backtest_result=s.backtest_result,
        copy_count=s.copy_count or 0, user_nickname=nickname,
        created_at=str(s.created_at), updated_at=str(s.updated_at),
    )
