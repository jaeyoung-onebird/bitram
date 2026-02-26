"""
Strategies API: CRUD, backtest, duplicate, indicators list, AI generation
"""
import logging
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from uuid import UUID
from typing import Optional
import pandas as pd

from db.database import get_db
from db.models import User, Strategy, Bot
from api.deps import get_current_user, get_plan_limits
from core.strategy_engine import validate_strategy_config, get_available_indicators
from core.upbit_client import get_public_client

logger = logging.getLogger(__name__)

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


# ─── AI Strategy Generation (must be before /{strategy_id} routes) ───────────


class AIGenerateRequest(BaseModel):
    pair: str = "KRW-BTC"
    timeframe: str = "15m"
    style: str = "balanced"  # aggressive, balanced, conservative, scalping, swing
    provider: str = "claude"  # claude | openai
    count: int = 5


@router.post("/ai-generate")
async def ai_generate_strategies(
    req: AIGenerateRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """AI가 전략을 생성하고 백테스트해서 결과를 반환"""
    from core.ai_strategy import ai_find_profitable_strategies

    # Fetch historical data for backtesting
    client = get_public_client()
    # More history is important for higher timeframes (4h/1d), otherwise strategies
    # often have 0 trades and can't be evaluated. Upbit candle API is paged, so
    # requesting >200 is OK.
    candle_count_map = {
        "5m": 1200,
        "15m": 1000,
        "1h": 1000,
        "4h": 800,
        "1d": 800,
    }
    candle_count = candle_count_map.get(req.timeframe, 600)
    all_candles = await client.fetch_ohlcv(req.pair, req.timeframe, candle_count)

    if not all_candles or len(all_candles) < 50:
        raise HTTPException(400, "백테스팅에 충분한 시장 데이터가 없습니다.")

    df = pd.DataFrame(all_candles)

    try:
        results = await ai_find_profitable_strategies(
            pair=req.pair,
            timeframe=req.timeframe,
            df=df,
            style=req.style,
            count=min(req.count, 8),
            provider=req.provider,
            # Keep the endpoint under typical reverse-proxy timeouts.
            time_budget_s=25.0,
        )
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        logger.error(f"AI strategy generation failed: {e}")
        raise HTTPException(500, "AI 전략 생성 중 오류가 발생했습니다.")

    profitable_count = len([r for r in results if r["backtest"]["total_return_pct"] > 0])
    return {
        "pair": req.pair,
        "timeframe": req.timeframe,
        "style": req.style,
        "provider": req.provider,
        "strategies": results,
        "total_generated": len(results),
        "profitable_count": profitable_count,
    }


class AISaveRequest(BaseModel):
    name: str
    description: str = ""
    pair: str
    timeframe: str
    config_json: dict


@router.post("/ai-save")
async def save_ai_generated_strategy(
    req: AISaveRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """AI가 생성한 전략을 내 전략으로 저장"""
    limits = get_plan_limits(user.plan)
    if limits["max_strategies"] > 0:
        stmt = select(func.count()).select_from(Strategy).where(Strategy.user_id == user.id)
        result = await db.execute(stmt)
        count = result.scalar()
        if count >= limits["max_strategies"]:
            raise HTTPException(403, f"현재 플랜의 전략 수 한도({limits['max_strategies']}개)에 도달했습니다.")

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
    )
    db.add(strategy)
    await db.commit()
    await db.refresh(strategy)

    return _to_response(strategy, user.nickname)


# ─── CRUD ────────────────────────────────────────────────────────────────────


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

    # Award points to original owner and copier
    if original.user_id != user.id:
        try:
            from core.points import award_points
            await award_points(db, original.user_id, "strategy_copied", f"전략 복사됨: {original.name[:30]}")
            await award_points(db, user.id, "marketplace_copy", f"마켓 전략 복사: {original.name[:30]}")
        except Exception:
            pass

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
