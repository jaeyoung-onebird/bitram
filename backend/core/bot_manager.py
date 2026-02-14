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
from config import get_settings
import pandas as pd

logger = logging.getLogger(__name__)

# Active bot tasks: {bot_id: asyncio.Task}
_active_bots: dict[str, asyncio.Task] = {}

# Kill switch: consecutive error count per bot
_error_counts: dict[str, int] = {}
MAX_CONSECUTIVE_ERRORS = 5


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

    # Reset error counter
    _error_counts[bot_id_str] = 0

    settings = get_settings()

    # Start execution loop
    task = asyncio.create_task(
        _bot_loop(bot_id, strategy.config_json, strategy.pair, strategy.timeframe,
                  access_key, secret_key, float(bot.max_investment),
                  paper=settings.PAPER_TRADING, fee_rate=settings.UPBIT_FEE_RATE)
    )
    _active_bots[bot_id_str] = task

    mode = "모의매매" if settings.PAPER_TRADING else "실매매"
    logger.info(f"Bot {bot_id} started in {mode} mode")
    return {"status": "started", "mode": mode}


async def stop_bot(bot_id: UUID, db: AsyncSession):
    """Stop a running bot."""
    bot_id_str = str(bot_id)
    task = _active_bots.pop(bot_id_str, None)
    if task and not task.done():
        task.cancel()

    _error_counts.pop(bot_id_str, None)

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

    _error_counts.pop(bot_id_str, None)

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
                    access_key: str, secret_key: str, max_investment: float,
                    paper: bool = True, fee_rate: float = 0.0005):
    """Main bot execution loop."""
    client = UpbitClient(access_key, secret_key)
    interval = TIMEFRAME_SECONDS.get(timeframe, 900)
    bot_id_str = str(bot_id)

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
                    paper=paper, fee_rate=fee_rate,
                )
                # Reset error count on successful cycle
                _error_counts[bot_id_str] = 0

            except asyncio.CancelledError:
                raise
            except Exception as e:
                logger.error(f"Bot {bot_id} cycle error: {e}")
                await _update_bot_error(bot_id, str(e))

                # Kill switch: stop bot after consecutive errors
                _error_counts[bot_id_str] = _error_counts.get(bot_id_str, 0) + 1
                if _error_counts[bot_id_str] >= MAX_CONSECUTIVE_ERRORS:
                    logger.critical(
                        f"Bot {bot_id} hit {MAX_CONSECUTIVE_ERRORS} consecutive errors — auto-stopping"
                    )
                    await _auto_stop_bot(bot_id)
                    return

            await asyncio.sleep(interval)

    except asyncio.CancelledError:
        logger.info(f"Bot {bot_id} cancelled")
    finally:
        await client.close()


async def _auto_stop_bot(bot_id: UUID):
    """Emergency stop: mark bot as error in DB."""
    from db.database import AsyncSessionLocal
    bot_id_str = str(bot_id)

    _active_bots.pop(bot_id_str, None)
    _error_counts.pop(bot_id_str, None)

    async with AsyncSessionLocal() as db:
        stmt = update(Bot).where(Bot.id == bot_id).values(
            status="error",
            stopped_at=datetime.now(timezone.utc),
            error_message=f"연속 {MAX_CONSECUTIVE_ERRORS}회 오류 발생으로 자동 중지됨",
        )
        await db.execute(stmt)
        await db.commit()


# ─── Order Helpers ───────────────────────────────────────────────────────────

def _parse_order_result(order: dict, fee_rate: float) -> dict:
    """Parse Upbit order response to extract actual fill price/quantity/fee."""
    trades = order.get("trades", [])
    if not trades:
        # Fallback: use order-level fields
        executed_volume = float(order.get("executed_volume", 0))
        paid_fee = float(order.get("paid_fee", 0))
        price = float(order.get("price", 0))
        if order.get("side") == "bid":
            # Market buy: price is total KRW spent
            total_krw = float(order.get("price", 0))
            avg_price = total_krw / executed_volume if executed_volume else 0
        else:
            avg_price = price
            total_krw = executed_volume * avg_price
        return {
            "avg_price": avg_price,
            "quantity": executed_volume,
            "total_krw": total_krw,
            "fee": paid_fee,
        }

    # Calculate from individual trades
    total_funds = sum(float(t.get("funds", 0)) for t in trades)
    total_volume = sum(float(t.get("volume", 0)) for t in trades)
    avg_price = total_funds / total_volume if total_volume else 0
    paid_fee = float(order.get("paid_fee", 0))

    return {
        "avg_price": avg_price,
        "quantity": total_volume,
        "total_krw": total_funds,
        "fee": paid_fee or total_funds * fee_rate,
    }


async def _paper_buy(client: UpbitClient, pair: str, invest: float, fee_rate: float) -> dict:
    """Simulate a buy order using current market price."""
    ticker = await client.get_ticker([pair])
    if not ticker:
        raise Exception("시세 조회 실패")
    current_price = float(ticker[0]["trade_price"])
    fee = invest * fee_rate
    quantity = (invest - fee) / current_price
    return {
        "avg_price": current_price,
        "quantity": quantity,
        "total_krw": invest,
        "fee": fee,
    }


async def _paper_sell(client: UpbitClient, pair: str, quantity: float, fee_rate: float) -> dict:
    """Simulate a sell order using current market price."""
    ticker = await client.get_ticker([pair])
    if not ticker:
        raise Exception("시세 조회 실패")
    current_price = float(ticker[0]["trade_price"])
    total_krw = quantity * current_price
    fee = total_krw * fee_rate
    return {
        "avg_price": current_price,
        "quantity": quantity,
        "total_krw": total_krw,
        "fee": fee,
    }


# ─── Execution Cycle ─────────────────────────────────────────────────────────

async def _execute_cycle(bot_id, client, config, pair, timeframe,
                         max_investment, amount_pct, stop_loss_pct, take_profit_pct,
                         paper: bool = True, fee_rate: float = 0.0005):
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
                qty = position["quantity"]

                if paper:
                    fill = await _paper_sell(client, pair, qty, fee_rate)
                    logger.info(f"Bot {bot_id} [PAPER] SELL {pair} qty={qty:.8f} price={fill['avg_price']:.0f}")
                else:
                    # Real order
                    order_resp = await client.order_sell_market(pair, qty)
                    order_uuid = order_resp.get("uuid")
                    if not order_uuid:
                        logger.error(f"Bot {bot_id} sell order failed: no uuid in response: {order_resp}")
                        return
                    # Wait for fill
                    final_order = await client.wait_order_done(order_uuid)
                    if final_order.get("state") != "done":
                        logger.error(f"Bot {bot_id} sell order not filled: state={final_order.get('state')}")
                        return
                    fill = _parse_order_result(final_order, fee_rate)
                    logger.info(f"Bot {bot_id} [LIVE] SELL {pair} qty={fill['quantity']:.8f} price={fill['avg_price']:.0f}")

                profit = fill["total_krw"] - fill["fee"] - position["cost"]
                actual_pnl_pct = profit / position["cost"] if position["cost"] else 0

                trade = Trade(
                    bot_id=bot_id, user_id=bot.user_id, side="sell", pair=pair,
                    price=Decimal(str(round(fill["avg_price"], 2))),
                    quantity=Decimal(str(fill["quantity"])),
                    total_krw=Decimal(str(round(fill["total_krw"], 2))),
                    fee=Decimal(str(round(fill["fee"], 2))),
                    profit=Decimal(str(round(profit, 2))),
                    profit_pct=round(actual_pnl_pct * 100, 2),
                    trigger_reason=reason,
                )
                db.add(trade)

                bot.current_position = {}
                bot.total_trades = (bot.total_trades or 0) + 1
                bot.total_profit = Decimal(str(float(bot.total_profit or 0) + profit))
                if profit > 0:
                    bot.win_trades = (bot.win_trades or 0) + 1
                await db.commit()

        # If no position and signal, enter
        elif signal:
            balance = await client.get_balance()
            available = min(balance["krw"], max_investment)
            invest = available * amount_pct

            if invest < 5000:
                return

            if paper:
                fill = await _paper_buy(client, pair, invest, fee_rate)
                logger.info(f"Bot {bot_id} [PAPER] BUY {pair} invest={invest:.0f} price={fill['avg_price']:.0f}")
            else:
                # Real order
                order_resp = await client.order_buy_market(pair, invest)
                order_uuid = order_resp.get("uuid")
                if not order_uuid:
                    logger.error(f"Bot {bot_id} buy order failed: no uuid in response: {order_resp}")
                    return
                # Wait for fill
                final_order = await client.wait_order_done(order_uuid)
                if final_order.get("state") != "done":
                    logger.error(f"Bot {bot_id} buy order not filled: state={final_order.get('state')}")
                    # Attempt to cancel unfilled order
                    try:
                        await client.cancel_order(order_uuid)
                    except Exception:
                        pass
                    return
                fill = _parse_order_result(final_order, fee_rate)
                logger.info(f"Bot {bot_id} [LIVE] BUY {pair} invest={invest:.0f} price={fill['avg_price']:.0f}")

            trade = Trade(
                bot_id=bot_id, user_id=bot.user_id, side="buy", pair=pair,
                price=Decimal(str(round(fill["avg_price"], 2))),
                quantity=Decimal(str(fill["quantity"])),
                total_krw=Decimal(str(round(fill["total_krw"], 2))),
                fee=Decimal(str(round(fill["fee"], 2))),
                trigger_reason="시그널 진입",
            )
            db.add(trade)

            bot.current_position = {
                "entry_price": fill["avg_price"],
                "quantity": fill["quantity"],
                "cost": fill["total_krw"],
                "entry_time": str(datetime.now(timezone.utc)),
            }
            await db.commit()


async def _update_bot_error(bot_id: UUID, error_msg: str):
    from db.database import AsyncSessionLocal
    async with AsyncSessionLocal() as db:
        stmt = update(Bot).where(Bot.id == bot_id).values(
            error_message=error_msg,
        )
        await db.execute(stmt)
        await db.commit()
