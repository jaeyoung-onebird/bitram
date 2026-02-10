"""
BITRAM Bot Manager
Manages bot lifecycle: start, stop, pause, execute strategy cycles.
"""
import asyncio
import logging
from datetime import datetime, timezone
from decimal import Decimal
from uuid import UUID
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from db.models import Bot, Trade, Strategy, ExchangeKey
from core.upbit_client import UpbitClient
from core.strategy_engine import evaluate_strategy
from core.encryption import decrypt_key
import pandas as pd

logger = logging.getLogger(__name__)

# Active bot tasks: {bot_id: asyncio.Task}
_active_bots: dict[str, asyncio.Task] = {}


async def start_bot(bot_id: UUID, db: AsyncSession):
    """Start a bot's execution loop."""
    bot_id_str = str(bot_id)
    if bot_id_str in _active_bots and not _active_bots[bot_id_str].done():
        return {"error": "봇이 이미 실행 중입니다."}

    # Load bot with strategy and keys
    stmt = select(Bot).where(Bot.id == bot_id)
    result = await db.execute(stmt)
    bot = result.scalar_one_or_none()
    if not bot:
        return {"error": "봇을 찾을 수 없습니다."}

    # Load strategy
    stmt = select(Strategy).where(Strategy.id == bot.strategy_id)
    result = await db.execute(stmt)
    strategy = result.scalar_one_or_none()
    if not strategy:
        return {"error": "전략을 찾을 수 없습니다."}

    # Load exchange key
    stmt = select(ExchangeKey).where(ExchangeKey.id == bot.exchange_key_id)
    result = await db.execute(stmt)
    key = result.scalar_one_or_none()
    if not key:
        return {"error": "API 키를 찾을 수 없습니다."}

    # Decrypt keys
    access_key = decrypt_key(key.access_key_enc)
    secret_key = decrypt_key(key.secret_key_enc)

    # Update bot status
    bot.status = "running"
    bot.started_at = datetime.now(timezone.utc)
    bot.error_message = None
    bot.config_snapshot = strategy.config_json
    await db.commit()

    # Start execution loop
    task = asyncio.create_task(
        _bot_loop(bot_id, strategy.config_json, strategy.pair, strategy.timeframe,
                  access_key, secret_key, float(bot.max_investment))
    )
    _active_bots[bot_id_str] = task
    return {"status": "started"}


async def stop_bot(bot_id: UUID, db: AsyncSession):
    """Stop a running bot."""
    bot_id_str = str(bot_id)
    task = _active_bots.pop(bot_id_str, None)
    if task and not task.done():
        task.cancel()

    stmt = update(Bot).where(Bot.id == bot_id).values(
        status="stopped",
        stopped_at=datetime.now(timezone.utc),
    )
    await db.execute(stmt)
    await db.commit()
    return {"status": "stopped"}


async def pause_bot(bot_id: UUID, db: AsyncSession):
    """Pause a running bot."""
    bot_id_str = str(bot_id)
    task = _active_bots.pop(bot_id_str, None)
    if task and not task.done():
        task.cancel()

    stmt = update(Bot).where(Bot.id == bot_id).values(status="paused")
    await db.execute(stmt)
    await db.commit()
    return {"status": "paused"}


def get_active_bots() -> dict:
    """Get dict of active bot IDs and their running status."""
    return {bid: not task.done() for bid, task in _active_bots.items()}


# ─── Bot Execution Loop ─────────────────────────────────────────────────────

TIMEFRAME_SECONDS = {
    "1m": 60, "3m": 180, "5m": 300, "10m": 600,
    "15m": 900, "30m": 1800, "1h": 3600, "4h": 14400, "1d": 86400,
}


async def _bot_loop(bot_id: UUID, config: dict, pair: str, timeframe: str,
                    access_key: str, secret_key: str, max_investment: float):
    """Main bot execution loop."""
    client = UpbitClient(access_key, secret_key)
    interval = TIMEFRAME_SECONDS.get(timeframe, 900)

    safety = config.get("safety", {})
    stop_loss_pct = safety.get("stop_loss", -100) / 100
    take_profit_pct = safety.get("take_profit", 100) / 100
    action = config.get("action", {})
    amount_pct = action.get("amount", 10) / 100

    try:
        while True:
            try:
                await _execute_cycle(
                    bot_id, client, config, pair, timeframe,
                    max_investment, amount_pct, stop_loss_pct, take_profit_pct,
                )
            except asyncio.CancelledError:
                raise
            except Exception as e:
                logger.error(f"Bot {bot_id} cycle error: {e}")
                await _update_bot_error(bot_id, str(e))

            await asyncio.sleep(interval)

    except asyncio.CancelledError:
        logger.info(f"Bot {bot_id} cancelled")
    finally:
        await client.close()


async def _execute_cycle(bot_id, client, config, pair, timeframe,
                         max_investment, amount_pct, stop_loss_pct, take_profit_pct):
    """Single execution cycle: fetch data, evaluate, trade if needed."""
    from db.database import AsyncSessionLocal

    # Fetch candles
    candles = await client.fetch_ohlcv(pair, timeframe, 200)
    if not candles:
        return

    df = pd.DataFrame(candles)

    # Evaluate strategy
    df = evaluate_strategy(config, df)

    # Check latest signal
    latest = df.iloc[-1]
    signal = bool(latest.get("signal", False))

    async with AsyncSessionLocal() as db:
        bot = await db.get(Bot, bot_id)
        if not bot or bot.status != "running":
            return

        position = bot.current_position or {}

        # If in position, check exit conditions
        if position.get("entry_price"):
            current_price = float(latest["close"])
            entry_price = position["entry_price"]
            pnl_pct = (current_price - entry_price) / entry_price

            if pnl_pct <= stop_loss_pct or pnl_pct >= take_profit_pct:
                # Exit position
                reason = "손절" if pnl_pct <= stop_loss_pct else "익절"
                try:
                    result = await client.order_sell_market(pair, position["quantity"])
                    profit = position["quantity"] * current_price * (1 - 0.0005) - position["cost"]

                    trade = Trade(
                        bot_id=bot_id, user_id=bot.user_id, side="sell", pair=pair,
                        price=Decimal(str(current_price)),
                        quantity=Decimal(str(position["quantity"])),
                        total_krw=Decimal(str(position["quantity"] * current_price)),
                        fee=Decimal(str(position["quantity"] * current_price * 0.0005)),
                        profit=Decimal(str(round(profit, 2))),
                        profit_pct=round(pnl_pct * 100, 2),
                        trigger_reason=reason,
                    )
                    db.add(trade)

                    bot.current_position = {}
                    bot.total_trades = (bot.total_trades or 0) + 1
                    bot.total_profit = Decimal(str(float(bot.total_profit or 0) + profit))
                    if profit > 0:
                        bot.win_trades = (bot.win_trades or 0) + 1
                    await db.commit()
                except Exception as e:
                    logger.error(f"Bot {bot_id} sell error: {e}")

        # If no position and signal, enter
        elif signal:
            try:
                balance = await client.get_balance()
                available = min(balance["krw"], max_investment)
                invest = available * amount_pct

                if invest < 5000:
                    return

                result = await client.order_buy_market(pair, invest)
                current_price = float(latest["close"])
                quantity = invest * (1 - 0.0005) / current_price

                trade = Trade(
                    bot_id=bot_id, user_id=bot.user_id, side="buy", pair=pair,
                    price=Decimal(str(current_price)),
                    quantity=Decimal(str(quantity)),
                    total_krw=Decimal(str(invest)),
                    fee=Decimal(str(invest * 0.0005)),
                    trigger_reason="시그널 진입",
                )
                db.add(trade)

                bot.current_position = {
                    "entry_price": current_price,
                    "quantity": quantity,
                    "cost": invest,
                    "entry_time": str(datetime.now(timezone.utc)),
                }
                await db.commit()
            except Exception as e:
                logger.error(f"Bot {bot_id} buy error: {e}")


async def _update_bot_error(bot_id: UUID, error_msg: str):
    from db.database import AsyncSessionLocal
    async with AsyncSessionLocal() as db:
        stmt = update(Bot).where(Bot.id == bot_id).values(
            error_message=error_msg,
        )
        await db.execute(stmt)
        await db.commit()
