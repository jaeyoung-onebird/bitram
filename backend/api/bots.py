"""
Bots API: create, start, stop, pause, list, trades, profit
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from uuid import UUID
from decimal import Decimal

from db.database import get_db
from db.models import User, Bot, Trade, Strategy, ExchangeKey
from api.deps import get_current_user, get_plan_limits
from core.bot_manager import start_bot, stop_bot, pause_bot

router = APIRouter(prefix="/api/bots", tags=["bots"])


class BotCreateRequest(BaseModel):
    name: str
    strategy_id: str
    exchange_key_id: str
    max_investment: float = 1_000_000


class BotResponse(BaseModel):
    id: str
    name: str
    strategy_id: str | None
    strategy_name: str | None = None
    status: str
    pair: str | None = None
    max_investment: float
    total_profit: float
    total_trades: int
    win_trades: int
    win_rate: float
    error_message: str | None
    started_at: str | None
    created_at: str


class TradeResponse(BaseModel):
    id: str
    side: str
    pair: str
    price: float
    quantity: float
    total_krw: float
    fee: float
    profit: float | None
    profit_pct: float | None
    trigger_reason: str | None
    executed_at: str


@router.post("", response_model=BotResponse)
async def create_bot(
    req: BotCreateRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    limits = get_plan_limits(user.plan)
    if limits["max_bots"] > 0:
        stmt = select(func.count()).select_from(Bot).where(
            Bot.user_id == user.id, Bot.status != "stopped"
        )
        result = await db.execute(stmt)
        count = result.scalar()
        if count >= limits["max_bots"]:
            raise HTTPException(403, f"현재 플랜의 봇 수 한도({limits['max_bots']}개)에 도달했습니다.")

    # Validate strategy and key ownership
    stmt = select(Strategy).where(Strategy.id == UUID(req.strategy_id), Strategy.user_id == user.id)
    result = await db.execute(stmt)
    strategy = result.scalar_one_or_none()
    if not strategy:
        raise HTTPException(404, "전략을 찾을 수 없습니다.")

    stmt = select(ExchangeKey).where(ExchangeKey.id == UUID(req.exchange_key_id), ExchangeKey.user_id == user.id)
    result = await db.execute(stmt)
    key = result.scalar_one_or_none()
    if not key or not key.is_valid:
        raise HTTPException(400, "유효한 API 키가 필요합니다.")

    bot = Bot(
        user_id=user.id,
        strategy_id=strategy.id,
        exchange_key_id=key.id,
        name=req.name,
        max_investment=Decimal(str(req.max_investment)),
    )
    db.add(bot)
    await db.commit()
    await db.refresh(bot)

    return _to_response(bot, strategy)


@router.get("", response_model=list[BotResponse])
async def list_bots(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(Bot, Strategy)
        .outerjoin(Strategy, Bot.strategy_id == Strategy.id)
        .where(Bot.user_id == user.id)
        .order_by(Bot.created_at.desc())
    )
    result = await db.execute(stmt)
    rows = result.all()
    return [_to_response(bot, strategy) for bot, strategy in rows]


@router.post("/{bot_id}/start")
async def start_bot_endpoint(
    bot_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    bot = await _get_user_bot(bot_id, user.id, db)
    if bot.status == "running":
        raise HTTPException(400, "봇이 이미 실행 중입니다.")

    result = await start_bot(bot.id, db)
    if "error" in result:
        raise HTTPException(400, result["error"])
    return result


@router.post("/{bot_id}/stop")
async def stop_bot_endpoint(
    bot_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    bot = await _get_user_bot(bot_id, user.id, db)
    result = await stop_bot(bot.id, db)
    return result


@router.post("/{bot_id}/pause")
async def pause_bot_endpoint(
    bot_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    bot = await _get_user_bot(bot_id, user.id, db)
    result = await pause_bot(bot.id, db)
    return result


@router.get("/{bot_id}/trades", response_model=list[TradeResponse])
async def get_bot_trades(
    bot_id: str,
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    bot = await _get_user_bot(bot_id, user.id, db)
    stmt = (
        select(Trade)
        .where(Trade.bot_id == bot.id)
        .order_by(Trade.executed_at.desc())
        .offset((page - 1) * size)
        .limit(size)
    )
    result = await db.execute(stmt)
    trades = result.scalars().all()
    return [_trade_response(t) for t in trades]


@router.get("/{bot_id}/profit")
async def get_bot_profit(
    bot_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    bot = await _get_user_bot(bot_id, user.id, db)
    return {
        "total_profit": float(bot.total_profit or 0),
        "total_trades": bot.total_trades or 0,
        "win_trades": bot.win_trades or 0,
        "win_rate": (bot.win_trades / bot.total_trades * 100) if bot.total_trades else 0,
    }


# ─── Helpers ─────────────────────────────────────────────────────────────────

async def _get_user_bot(bot_id: str, user_id, db: AsyncSession) -> Bot:
    stmt = select(Bot).where(Bot.id == UUID(bot_id), Bot.user_id == user_id)
    result = await db.execute(stmt)
    bot = result.scalar_one_or_none()
    if not bot:
        raise HTTPException(404, "봇을 찾을 수 없습니다.")
    return bot


def _to_response(bot: Bot, strategy: Strategy = None) -> BotResponse:
    total = bot.total_trades or 0
    wins = bot.win_trades or 0
    return BotResponse(
        id=str(bot.id), name=bot.name,
        strategy_id=str(bot.strategy_id) if bot.strategy_id else None,
        strategy_name=strategy.name if strategy else None,
        status=bot.status,
        pair=strategy.pair if strategy else None,
        max_investment=float(bot.max_investment or 0),
        total_profit=float(bot.total_profit or 0),
        total_trades=total, win_trades=wins,
        win_rate=round(wins / total * 100, 1) if total > 0 else 0,
        error_message=bot.error_message,
        started_at=str(bot.started_at) if bot.started_at else None,
        created_at=str(bot.created_at),
    )


def _trade_response(t: Trade) -> TradeResponse:
    return TradeResponse(
        id=str(t.id), side=t.side, pair=t.pair,
        price=float(t.price), quantity=float(t.quantity),
        total_krw=float(t.total_krw), fee=float(t.fee),
        profit=float(t.profit) if t.profit else None,
        profit_pct=t.profit_pct,
        trigger_reason=t.trigger_reason,
        executed_at=str(t.executed_at),
    )
