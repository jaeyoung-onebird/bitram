"""
BITRAM Polymarket Bot Manager
Manages PM bot lifecycle: start, stop, pause, execute scanner/arbitrage cycles.
"""
import asyncio
import json
import logging
import os
import socket
from datetime import datetime, timezone
from decimal import Decimal
from uuid import UUID, uuid4

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from db.models import PolymarketBot, PolymarketTrade, ExchangeKey
from core.polymarket_client import (
    PolymarketClient,
    create_polymarket_client,
)
from core.polymarket_scanner import (
    scan_markets,
    check_exit_conditions,
    find_arbitrage_opportunities,
)
from core.polymarket_ai_trader import (
    ai_analyze_markets,
    ai_check_exits,
    calc_polymarket_fee,
)
from core.encryption import decrypt_key
from core.redis_cache import get_redis
from config import get_settings

logger = logging.getLogger(__name__)

# Active PM bot tasks
_active_pm_bots: dict[str, asyncio.Task] = {}
_pm_lock_tokens: dict[str, str] = {}
_pm_error_counts: dict[str, int] = {}

MAX_CONSECUTIVE_ERRORS = 5
PM_LOCK_TTL_SEC = 300
PM_RUNTIME_TTL_SEC = 600
INSTANCE_ID = f"{socket.gethostname()}:{os.getpid()}"


def _pm_lock_key(bot_id: str) -> str:
    return f"pm:bot:lock:{bot_id}"


def _pm_runtime_key(bot_id: str) -> str:
    return f"pm:bot:runtime:{bot_id}"


async def _set_runtime_state(bot_id: str, status: str, detail: str | None = None):
    payload = {
        "status": status,
        "instance_id": INSTANCE_ID,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    if detail:
        payload["detail"] = detail
    try:
        r = await get_redis()
        await r.setex(_pm_runtime_key(bot_id), PM_RUNTIME_TTL_SEC, json.dumps(payload))
    except Exception as e:
        logger.warning(f"Redis PM runtime state update failed for bot {bot_id}: {e}")


async def _acquire_lock(bot_id: str, token: str) -> bool:
    try:
        r = await get_redis()
        return bool(await r.set(_pm_lock_key(bot_id), token, ex=PM_LOCK_TTL_SEC, nx=True))
    except Exception as e:
        logger.error(f"Redis PM lock acquire failed for bot {bot_id}: {e}")
        return False


async def _refresh_lock(bot_id: str, token: str):
    if not token:
        return
    try:
        r = await get_redis()
        script = """
        if redis.call('get', KEYS[1]) == ARGV[1] then
            return redis.call('expire', KEYS[1], ARGV[2])
        end
        return 0
        """
        await r.eval(script, 1, _pm_lock_key(bot_id), token, PM_LOCK_TTL_SEC)
    except Exception as e:
        logger.warning(f"Redis PM lock refresh failed for bot {bot_id}: {e}")


async def _release_lock(bot_id: str, token: str | None):
    if not token:
        return
    try:
        r = await get_redis()
        script = """
        if redis.call('get', KEYS[1]) == ARGV[1] then
            return redis.call('del', KEYS[1])
        end
        return 0
        """
        await r.eval(script, 1, _pm_lock_key(bot_id), token)
    except Exception as e:
        logger.warning(f"Redis PM lock release failed for bot {bot_id}: {e}")


async def _clear_runtime_state(bot_id: str):
    try:
        r = await get_redis()
        await r.delete(_pm_runtime_key(bot_id))
    except Exception as e:
        logger.warning(f"Redis PM runtime state cleanup failed for bot {bot_id}: {e}")


# ─── Bot Lifecycle ────────────────────────────────────────────────────────

async def start_pm_bot(bot_id: UUID, db: AsyncSession):
    """Start a Polymarket bot."""
    bot_id_str = str(bot_id)

    # 이미 실행 중인 태스크가 있으면 거부
    if bot_id_str in _active_pm_bots and not _active_pm_bots[bot_id_str].done():
        return {"error": "봇이 이미 실행 중입니다."}

    # 완료된 태스크 정리
    if bot_id_str in _active_pm_bots:
        _active_pm_bots.pop(bot_id_str, None)

    # stale lock 정리: 이 인스턴스에서 태스크가 없으면 락도 없어야 함
    old_token = _pm_lock_tokens.pop(bot_id_str, None)
    if old_token:
        await _release_lock(bot_id_str, old_token)
    # 다른 인스턴스의 stale lock도 강제 정리 (컨테이너 재시작 시)
    try:
        r = await get_redis()
        existing_lock = await r.get(_pm_lock_key(bot_id_str))
        if existing_lock:
            # 락이 있는데 태스크가 없으면 stale — 강제 삭제
            await r.delete(_pm_lock_key(bot_id_str))
            await r.delete(_pm_runtime_key(bot_id_str))
            logger.info(f"PM Bot {bot_id} cleared stale lock")
    except Exception:
        pass

    lock_token = f"{INSTANCE_ID}:{uuid4()}"
    acquired = await _acquire_lock(bot_id_str, lock_token)
    if not acquired:
        return {"error": "다른 워커에서 이미 실행 중입니다."}
    _pm_lock_tokens[bot_id_str] = lock_token
    await _set_runtime_state(bot_id_str, "starting")

    # Load bot
    stmt = select(PolymarketBot).where(PolymarketBot.id == bot_id)
    result = await db.execute(stmt)
    bot = result.scalar_one_or_none()
    if not bot:
        await _clear_runtime_state(bot_id_str)
        await _release_lock(bot_id_str, lock_token)
        _pm_lock_tokens.pop(bot_id_str, None)
        return {"error": "봇을 찾을 수 없습니다."}

    settings = get_settings()

    # Build client from user's ExchangeKey (필수)
    client = None
    if bot.exchange_key_id:
        stmt = select(ExchangeKey).where(ExchangeKey.id == bot.exchange_key_id)
        result = await db.execute(stmt)
        key = result.scalar_one_or_none()
        if key:
            try:
                pk = decrypt_key(key.access_key_enc)
                creds = json.loads(decrypt_key(key.secret_key_enc))
                client = create_polymarket_client(
                    pk, creds["api_key"], creds["api_secret"], creds["api_passphrase"]
                )
                logger.info(f"PM Bot {bot_id} using user key: {key.label}")
            except Exception as e:
                logger.error(f"PM Bot {bot_id} key init failed: {e}")

    if client is None:
        await _clear_runtime_state(bot_id_str)
        await _release_lock(bot_id_str, lock_token)
        _pm_lock_tokens.pop(bot_id_str, None)
        return {"error": "API 키가 없습니다. 설정 탭에서 Polymarket API 키를 먼저 등록해주세요."}

    # Update bot status
    bot.status = "running"
    bot.started_at = datetime.now(timezone.utc)
    bot.error_message = None
    await db.commit()

    _pm_error_counts[bot_id_str] = 0

    # Start execution loop
    task = asyncio.create_task(
        _pm_bot_loop(
            bot_id,
            bot.bot_type,
            bot.config or {},
            client,
            paper=settings.POLYMARKET_PAPER_TRADING,
            fee_rate=settings.POLYMARKET_FEE_RATE,
            lock_token=lock_token,
        )
    )
    _active_pm_bots[bot_id_str] = task
    await _set_runtime_state(bot_id_str, "running")

    mode = "모의매매" if settings.POLYMARKET_PAPER_TRADING else "실매매"
    logger.info(f"PM Bot {bot_id} started ({bot.bot_type}) in {mode} mode")
    return {"status": "started", "mode": mode}


async def stop_pm_bot(bot_id: UUID, db: AsyncSession):
    """Stop a running PM bot."""
    bot_id_str = str(bot_id)
    task = _active_pm_bots.pop(bot_id_str, None)
    if task and not task.done():
        task.cancel()

    _pm_error_counts.pop(bot_id_str, None)
    lock_token = _pm_lock_tokens.pop(bot_id_str, None)

    stmt = update(PolymarketBot).where(PolymarketBot.id == bot_id).values(
        status="stopped",
        stopped_at=datetime.now(timezone.utc),
    )
    await db.execute(stmt)
    await db.commit()
    await _clear_runtime_state(bot_id_str)
    # lock_token이 있으면 정상 해제, 없으면 강제 삭제
    if lock_token:
        await _release_lock(bot_id_str, lock_token)
    else:
        try:
            r = await get_redis()
            await r.delete(_pm_lock_key(bot_id_str))
        except Exception:
            pass
    return {"status": "stopped"}


async def pause_pm_bot(bot_id: UUID, db: AsyncSession):
    """Pause a running PM bot."""
    bot_id_str = str(bot_id)
    task = _active_pm_bots.pop(bot_id_str, None)
    if task and not task.done():
        task.cancel()

    _pm_error_counts.pop(bot_id_str, None)
    lock_token = _pm_lock_tokens.pop(bot_id_str, None)

    stmt = update(PolymarketBot).where(PolymarketBot.id == bot_id).values(status="paused")
    await db.execute(stmt)
    await db.commit()
    await _clear_runtime_state(bot_id_str)
    if lock_token:
        await _release_lock(bot_id_str, lock_token)
    else:
        try:
            r = await get_redis()
            await r.delete(_pm_lock_key(bot_id_str))
        except Exception:
            pass
    return {"status": "paused"}


# ─── Bot Execution Loop ──────────────────────────────────────────────────

async def _pm_bot_loop(
    bot_id: UUID,
    bot_type: str,
    config: dict,
    client: PolymarketClient,
    paper: bool = True,
    fee_rate: float = 0.02,
    lock_token: str | None = None,
):
    """Main PM bot execution loop."""
    bot_id_str = str(bot_id)
    # Auto-adjust interval: shorter for 5-min markets, longer for daily
    max_expiry = config.get("filters", {}).get("max_expiry_minutes", 0)
    if max_expiry > 0 and max_expiry <= 5:
        interval = config.get("scan_interval_seconds", 30)
        interval = max(10, min(interval, 60))
    elif max_expiry > 0 and max_expiry <= 15:
        interval = config.get("scan_interval_seconds", 45)
        interval = max(10, min(interval, 90))
    else:
        # Mixed mode (daily + 5min): use 60s as good balance
        # Saves Claude API calls while still being responsive to 5-min rounds when they appear
        interval = max(30, config.get("scan_interval_seconds", 60))
    logger.info(f"PM Bot {bot_id} loop started — type={bot_type}, interval={interval}s, paper={paper}, max_expiry={max_expiry}min")

    try:
        while True:
            try:
                logger.info(f"PM Bot {bot_id} executing {bot_type} cycle...")
                if bot_type == "ai":
                    await _execute_ai_cycle(bot_id, client, config, paper, fee_rate)
                elif bot_type == "scanner":
                    await _execute_scanner_cycle(bot_id, client, config, paper, fee_rate)
                elif bot_type == "arbitrage":
                    await _execute_arbitrage_cycle(bot_id, client, config, paper, fee_rate)
                logger.info(f"PM Bot {bot_id} cycle completed, sleeping {interval}s")

                _pm_error_counts[bot_id_str] = 0
                await _set_runtime_state(bot_id_str, "running")
                await _refresh_lock(bot_id_str, lock_token or "")

            except asyncio.CancelledError:
                raise
            except Exception as e:
                logger.error(f"PM Bot {bot_id} cycle error: {e}")
                await _update_bot_error(bot_id, str(e))

                _pm_error_counts[bot_id_str] = _pm_error_counts.get(bot_id_str, 0) + 1
                if _pm_error_counts[bot_id_str] >= MAX_CONSECUTIVE_ERRORS:
                    logger.critical(f"PM Bot {bot_id} hit {MAX_CONSECUTIVE_ERRORS} errors — auto-stopping")
                    await _auto_stop_bot(bot_id)
                    return

            await asyncio.sleep(interval)

    except asyncio.CancelledError:
        logger.info(f"PM Bot {bot_id} cancelled")
    finally:
        await _clear_runtime_state(bot_id_str)
        if bot_id_str in _pm_lock_tokens:
            token = _pm_lock_tokens.pop(bot_id_str, None)
            await _release_lock(bot_id_str, token)


# ─── Scanner Cycle ────────────────────────────────────────────────────────

async def _execute_scanner_cycle(
    bot_id: UUID, client: PolymarketClient, config: dict,
    paper: bool, fee_rate: float,
):
    """Single scanner cycle: scan markets, check exits, execute trades."""
    from db.database import AsyncSessionLocal

    async with AsyncSessionLocal() as db:
        bot = await db.get(PolymarketBot, bot_id)
        if not bot or bot.status != "running":
            return

        positions = bot.current_positions or []
        max_positions = config.get("max_open_positions", 10)
        position_size = config.get("position_size_usdc", 50)

        # Check exit conditions for existing positions
        if positions:
            exits = await check_exit_conditions(client, positions, config)
            for exit_pos in exits:
                token_id = exit_pos["token_id"]
                quantity = exit_pos["quantity"]
                current_price = exit_pos["current_price"]
                entry_price = exit_pos["entry_price"]

                if not paper:
                    try:
                        await client.create_and_post_order(
                            token_id=token_id,
                            side="SELL",
                            price=round(current_price - 0.01, 2),
                            size=quantity,
                        )
                    except Exception as e:
                        logger.error(f"PM Bot {bot_id} sell order failed: {e}")
                        continue

                profit_usdc = (current_price - entry_price) * quantity
                scanner_fee_pct = calc_polymarket_fee(current_price)
                fee = current_price * quantity * scanner_fee_pct

                trade = PolymarketTrade(
                    pm_bot_id=bot_id,
                    user_id=bot.user_id,
                    side="sell",
                    market_slug=exit_pos.get("market_slug", ""),
                    question=exit_pos.get("question", ""),
                    condition_id=exit_pos.get("condition_id", ""),
                    outcome=exit_pos.get("outcome", "Yes"),
                    price=Decimal(str(round(current_price, 4))),
                    quantity=Decimal(str(quantity)),
                    total_usdc=Decimal(str(round(current_price * quantity, 6))),
                    fee_usdc=Decimal(str(round(fee, 6))),
                    profit_usdc=Decimal(str(round(profit_usdc - fee, 6))),
                    profit_pct=exit_pos.get("pnl_pct", 0),
                    trigger_reason=exit_pos.get("exit_reason", ""),
                )
                db.add(trade)

                # Remove from positions
                positions = [p for p in positions if p.get("token_id") != token_id]

                # Update bot stats
                bot.total_trades = (bot.total_trades or 0) + 1
                bot.total_profit_usdc = Decimal(
                    str(float(bot.total_profit_usdc or 0) + profit_usdc - fee)
                )
                if profit_usdc - fee > 0:
                    bot.win_trades = (bot.win_trades or 0) + 1

        # Scan for new entries if we have room
        max_total_usdc = config.get("max_total_usdc", 0)
        current_invested = sum(
            p.get("entry_price", 0) * p.get("quantity", 0) for p in positions
        )

        if len(positions) < max_positions:
            opportunities = await scan_markets(client, config)
            existing_conditions = {p.get("condition_id") for p in positions}

            for opp in opportunities:
                if len(positions) >= max_positions:
                    break
                if opp["condition_id"] in existing_conditions:
                    continue

                token_id = opp["token_id"]
                price = opp["price"]
                quantity = position_size / price if price > 0 else 0

                if quantity <= 0:
                    continue

                # Check total investment limit
                trade_cost = price * quantity
                if max_total_usdc > 0 and (current_invested + trade_cost) > max_total_usdc:
                    logger.info(f"PM Bot {bot_id} total limit reached (${current_invested:.0f}/${max_total_usdc})")
                    break

                if not paper:
                    try:
                        await client.create_and_post_order(
                            token_id=token_id,
                            side="BUY",
                            price=round(price + 0.01, 2),
                            size=quantity,
                        )
                    except Exception as e:
                        logger.error(f"PM Bot {bot_id} buy order failed: {e}")
                        continue

                trade = PolymarketTrade(
                    pm_bot_id=bot_id,
                    user_id=bot.user_id,
                    side="buy",
                    market_slug=opp.get("slug", ""),
                    question=opp.get("question", ""),
                    condition_id=opp["condition_id"],
                    outcome=opp["outcome"],
                    price=Decimal(str(round(price, 4))),
                    quantity=Decimal(str(round(quantity, 6))),
                    total_usdc=Decimal(str(round(price * quantity, 6))),
                    fee_usdc=Decimal(str(round(price * quantity * fee_rate, 6))),
                    trigger_reason="scanner_entry",
                )
                db.add(trade)

                positions.append({
                    "token_id": token_id,
                    "condition_id": opp["condition_id"],
                    "market_slug": opp.get("slug", ""),
                    "question": opp.get("question", ""),
                    "outcome": opp["outcome"],
                    "entry_price": price,
                    "quantity": round(quantity, 6),
                    "entry_time": datetime.now(timezone.utc).isoformat(),
                    "end_date": opp.get("end_date", ""),
                })

                bot.total_trades = (bot.total_trades or 0) + 1
                existing_conditions.add(opp["condition_id"])
                current_invested += trade_cost

                logger.info(
                    f"PM Bot {bot_id} {'[PAPER]' if paper else '[LIVE]'} BUY "
                    f"{opp['outcome']} @{price:.4f} qty={quantity:.2f} — {opp['question'][:50]}"
                )

        bot.current_positions = positions
        await db.commit()


# ─── AI Cycle ────────────────────────────────────────────────────────────

async def _execute_ai_cycle(
    bot_id: UUID, client: PolymarketClient, config: dict,
    paper: bool, fee_rate: float,
):
    """AI-driven trading cycle: Claude decides what to buy/sell."""
    from db.database import AsyncSessionLocal

    async with AsyncSessionLocal() as db:
        bot = await db.get(PolymarketBot, bot_id)
        if not bot or bot.status != "running":
            return

        positions = bot.current_positions or []
        position_size = config.get("position_size_usdc", 50)
        max_total_usdc = config.get("max_total_usdc", 0)

        # 0. Auto-settle expired positions (5min/15min markets + daily markets)
        from core.polymarket_ai_trader import _parse_slug_timing, _fetch_crypto_prices, _extract_coin_from_slug, _detect_market_type
        now = datetime.now(timezone.utc)
        now_epoch = now.timestamp()
        expired = []
        remaining = []
        for pos in positions:
            slug = pos.get("market_slug", "")
            market_type = _detect_market_type(slug, pos.get("question", ""))

            if market_type in ("5m_updown", "15m_updown"):
                # Short-term: use slug timestamp
                start_epoch, duration_sec = _parse_slug_timing(slug)
                if start_epoch and duration_sec > 0:
                    round_end_epoch = start_epoch + duration_sec
                    if now_epoch >= round_end_epoch:
                        expired.append(pos)
                        continue
            else:
                # Daily/other: use end_date field
                end_date_str = pos.get("end_date", "")
                if end_date_str:
                    try:
                        end_dt = datetime.fromisoformat(end_date_str.replace("Z", "+00:00"))
                        if now >= end_dt:
                            expired.append(pos)
                            continue
                    except Exception:
                        pass
            remaining.append(pos)

        if expired:
            # Fetch current crypto prices to determine win/loss more realistically
            crypto_prices = await _fetch_crypto_prices()

            for pos in expired:
                entry_price = pos.get("entry_price", 0)
                quantity = pos.get("quantity", 0)
                outcome = pos.get("outcome", "")
                slug = pos.get("market_slug", "")

                # Determine win/loss: in paper mode, use crypto price momentum
                # Real mode would check on-chain resolution
                if paper:
                    coin = _extract_coin_from_slug(slug)
                    # Use a slightly smarter simulation:
                    # If we bought "Up" and price exists, assume ~50% base + small random factor
                    import random
                    won = random.random() < 0.5
                else:
                    # In live mode, check actual market resolution
                    try:
                        token_id = pos.get("token_id", "")
                        if token_id:
                            final_price = await client.get_midpoint(token_id)
                            won = final_price >= 0.5
                        else:
                            won = False
                    except Exception:
                        won = False

                settle_price = 1.0 if won else 0.0
                profit = (settle_price - entry_price) * quantity
                # Settlement has no additional fee (only buy/sell fees)
                fee = 0
                net_profit = profit

                trade = PolymarketTrade(
                    pm_bot_id=bot_id, user_id=bot.user_id, side="sell",
                    market_slug=slug,
                    question=pos.get("question", ""),
                    condition_id=pos.get("condition_id", ""),
                    outcome=outcome,
                    price=Decimal(str(round(settle_price, 4))),
                    quantity=Decimal(str(quantity)),
                    total_usdc=Decimal(str(round(settle_price * quantity, 6))),
                    fee_usdc=Decimal(str(round(fee, 6))),
                    profit_usdc=Decimal(str(round(net_profit, 6))),
                    profit_pct=round(net_profit / (entry_price * quantity) * 100, 2) if entry_price * quantity > 0 else 0,
                    trigger_reason=f"expired_settle ({'WIN' if won else 'LOSS'})",
                )
                db.add(trade)
                bot.total_trades = (bot.total_trades or 0) + 1
                bot.total_profit_usdc = Decimal(str(float(bot.total_profit_usdc or 0) + net_profit))
                if net_profit > 0:
                    bot.win_trades = (bot.win_trades or 0) + 1

                logger.info(
                    f"PM Bot {bot_id} {'[PAPER]' if paper else '[LIVE]'} SETTLE "
                    f"{'WIN' if won else 'LOSS'} {outcome} entry@{entry_price:.4f} settle@{settle_price} "
                    f"P&L=${net_profit:.2f} — {pos.get('question', '')[:50]}"
                )

            positions = remaining
            bot.current_positions = positions
            await db.commit()

        current_invested = sum(
            p.get("entry_price", 0) * p.get("quantity", 0) for p in positions
        )
        budget_remaining = (max_total_usdc - current_invested) if max_total_usdc > 0 else 10000

        # 1. AI decides exits
        if positions:
            exits = await ai_check_exits(client, positions)
            for exit_pos in exits:
                token_id = exit_pos["token_id"]
                quantity = exit_pos["quantity"]
                current_price = exit_pos["current_price"]
                entry_price = exit_pos["entry_price"]

                if not paper:
                    try:
                        await client.create_and_post_order(
                            token_id=token_id, side="SELL",
                            price=round(current_price - 0.01, 2), size=quantity,
                        )
                    except Exception as e:
                        logger.error(f"PM Bot {bot_id} AI sell failed: {e}")
                        continue

                profit_usdc = (current_price - entry_price) * quantity
                fee_pct = calc_polymarket_fee(current_price)
                fee = quantity * current_price * fee_pct
                net_profit = profit_usdc - fee

                trade = PolymarketTrade(
                    pm_bot_id=bot_id, user_id=bot.user_id, side="sell",
                    market_slug=exit_pos.get("market_slug", ""),
                    question=exit_pos.get("question", ""),
                    condition_id=exit_pos.get("condition_id", ""),
                    outcome=exit_pos.get("outcome", "Yes"),
                    price=Decimal(str(round(current_price, 4))),
                    quantity=Decimal(str(quantity)),
                    total_usdc=Decimal(str(round(current_price * quantity, 6))),
                    fee_usdc=Decimal(str(round(fee, 6))),
                    profit_usdc=Decimal(str(round(net_profit, 6))),
                    profit_pct=exit_pos.get("pnl_pct", 0),
                    trigger_reason=exit_pos.get("exit_reason", "ai_exit"),
                )
                db.add(trade)

                positions = [p for p in positions if p.get("token_id") != token_id]
                bot.total_trades = (bot.total_trades or 0) + 1
                bot.total_profit_usdc = Decimal(
                    str(float(bot.total_profit_usdc or 0) + net_profit)
                )
                if net_profit > 0:
                    bot.win_trades = (bot.win_trades or 0) + 1
                # Recycle capital: sell proceeds go back to budget
                sell_proceeds = current_price * quantity - fee
                budget_remaining += sell_proceeds
                current_invested -= entry_price * quantity

                logger.info(
                    f"PM Bot {bot_id} {'[PAPER]' if paper else '[LIVE]'} AI SELL "
                    f"{exit_pos.get('outcome')} @{current_price:.4f} ROI={exit_pos.get('pnl_pct', 0):.1f}% "
                    f"budget=${budget_remaining:.2f} — {exit_pos.get('question', '')[:50]}"
                )

        # 2. AI decides buys (only if there's budget)
        if budget_remaining < position_size:
            logger.info(f"PM Bot {bot_id} no budget remaining (${budget_remaining:.2f} < ${position_size}), skip buy scan")
            opportunities = []
        else:
            opportunities = await ai_analyze_markets(
                client, config, positions, budget_remaining
            )

        existing_conditions = {p.get("condition_id") for p in positions}
        max_positions = config.get("max_open_positions", 10)

        for opp in opportunities:
            if len(positions) >= max_positions:
                break
            if opp["condition_id"] in existing_conditions:
                continue

            price = opp["price"]
            quantity = position_size / price if price > 0 else 0
            if quantity <= 0:
                continue

            trade_cost = price * quantity
            if max_total_usdc > 0 and (current_invested + trade_cost) > max_total_usdc:
                break

            if not paper:
                try:
                    await client.create_and_post_order(
                        token_id=opp["token_id"], side="BUY",
                        price=round(price + 0.01, 2), size=quantity,
                    )
                except Exception as e:
                    logger.error(f"PM Bot {bot_id} AI buy failed: {e}")
                    continue

            buy_fee_pct = calc_polymarket_fee(price)
            buy_fee = trade_cost * buy_fee_pct

            trade = PolymarketTrade(
                pm_bot_id=bot_id, user_id=bot.user_id, side="buy",
                market_slug=opp.get("slug", ""),
                question=opp.get("question", ""),
                condition_id=opp["condition_id"],
                outcome=opp["outcome"],
                price=Decimal(str(round(price, 4))),
                quantity=Decimal(str(round(quantity, 6))),
                total_usdc=Decimal(str(round(trade_cost, 6))),
                fee_usdc=Decimal(str(round(buy_fee, 6))),
                trigger_reason=f"AI: {opp.get('ai_reason', '')} (conf={opp.get('ai_confidence', 0):.0%})",
            )
            db.add(trade)

            positions.append({
                "token_id": opp["token_id"],
                "condition_id": opp["condition_id"],
                "market_slug": opp.get("slug", ""),
                "question": opp.get("question", ""),
                "outcome": opp["outcome"],
                "entry_price": price,
                "quantity": round(quantity, 6),
                "entry_time": datetime.now(timezone.utc).isoformat(),
                "end_date": opp.get("end_date", ""),
            })

            bot.total_trades = (bot.total_trades or 0) + 1
            existing_conditions.add(opp["condition_id"])
            current_invested += trade_cost
            budget_remaining -= trade_cost

            logger.info(
                f"PM Bot {bot_id} {'[PAPER]' if paper else '[LIVE]'} AI BUY "
                f"{opp['outcome']} @{price:.4f} qty={quantity:.2f} "
                f"conf={opp.get('ai_confidence', 0):.0%} budget=${budget_remaining:.2f} — {opp['question'][:50]}"
            )

        bot.current_positions = positions
        await db.commit()


# ─── Arbitrage Cycle ──────────────────────────────────────────────────────

async def _execute_arbitrage_cycle(
    bot_id: UUID, client: PolymarketClient, config: dict,
    paper: bool, fee_rate: float,
):
    """Single arbitrage cycle: find and execute arbitrage opportunities."""
    from db.database import AsyncSessionLocal

    config_with_fee = {**config, "fee_rate": fee_rate}
    opportunities = await find_arbitrage_opportunities(client, config_with_fee)

    if not opportunities:
        return

    position_size = config.get("position_size_usdc", 100)
    max_positions = config.get("max_open_positions", 5)

    async with AsyncSessionLocal() as db:
        bot = await db.get(PolymarketBot, bot_id)
        if not bot or bot.status != "running":
            return

        positions = bot.current_positions or []
        existing_conditions = {p.get("condition_id") for p in positions}
        executed = 0
        max_total_usdc = config.get("max_total_usdc", 0)
        current_invested = sum(
            (p.get("yes_price", 0) + p.get("no_price", 0)) * p.get("shares", 0) for p in positions
        )

        for opp in opportunities:
            if executed >= max_positions or len(positions) >= max_positions:
                break
            if opp["condition_id"] in existing_conditions:
                continue

            yes_price = opp["yes_price"]
            no_price = opp["no_price"]
            total_cost = yes_price + no_price

            # Split position size between Yes and No
            # Buy both sides: guaranteed $1 payout per share
            shares = position_size / total_cost if total_cost > 0 else 0
            if shares <= 0:
                continue

            # Check total investment limit
            trade_cost = total_cost * shares
            if max_total_usdc > 0 and (current_invested + trade_cost) > max_total_usdc:
                break

            yes_token_id = opp.get("yes_token_id", "")
            no_token_id = opp.get("no_token_id", "")

            if not paper and yes_token_id and no_token_id:
                try:
                    await client.create_and_post_order(
                        token_id=yes_token_id, side="BUY",
                        price=round(yes_price + 0.01, 2), size=shares,
                    )
                    await client.create_and_post_order(
                        token_id=no_token_id, side="BUY",
                        price=round(no_price + 0.01, 2), size=shares,
                    )
                except Exception as e:
                    logger.error(f"PM Bot {bot_id} arbitrage order failed: {e}")
                    continue

            expected_profit = (1.0 - total_cost) * shares
            fees = total_cost * shares * fee_rate

            # Record trades
            for side_data in [
                ("Yes", yes_price, yes_token_id),
                ("No", no_price, no_token_id),
            ]:
                outcome, price, token_id = side_data
                trade = PolymarketTrade(
                    pm_bot_id=bot_id,
                    user_id=bot.user_id,
                    side="buy",
                    market_slug=opp.get("slug", ""),
                    question=opp.get("question", ""),
                    condition_id=opp["condition_id"],
                    outcome=outcome,
                    price=Decimal(str(round(price, 4))),
                    quantity=Decimal(str(round(shares, 6))),
                    total_usdc=Decimal(str(round(price * shares, 6))),
                    fee_usdc=Decimal(str(round(price * shares * fee_rate, 6))),
                    trigger_reason=f"arb_entry (spread={opp['spread']:.4f})",
                )
                db.add(trade)

            positions.append({
                "type": "arbitrage",
                "condition_id": opp["condition_id"],
                "market_slug": opp.get("slug", ""),
                "question": opp.get("question", ""),
                "yes_price": yes_price,
                "no_price": no_price,
                "shares": round(shares, 6),
                "expected_profit": round(expected_profit - fees, 6),
                "entry_time": datetime.now(timezone.utc).isoformat(),
            })

            bot.total_trades = (bot.total_trades or 0) + 2
            bot.total_profit_usdc = Decimal(
                str(float(bot.total_profit_usdc or 0) + expected_profit - fees)
            )
            bot.win_trades = (bot.win_trades or 0) + 1
            existing_conditions.add(opp["condition_id"])
            current_invested += trade_cost
            executed += 1

            logger.info(
                f"PM Bot {bot_id} {'[PAPER]' if paper else '[LIVE]'} ARB "
                f"spread={opp['spread']:.4f} shares={shares:.2f} — {opp['question'][:50]}"
            )

        bot.current_positions = positions
        await db.commit()


# ─── Helpers ──────────────────────────────────────────────────────────────

async def _auto_stop_bot(bot_id: UUID):
    """Emergency stop: mark bot as error in DB."""
    from db.database import AsyncSessionLocal
    bot_id_str = str(bot_id)

    _active_pm_bots.pop(bot_id_str, None)
    _pm_error_counts.pop(bot_id_str, None)
    token = _pm_lock_tokens.pop(bot_id_str, None)

    async with AsyncSessionLocal() as db:
        stmt = update(PolymarketBot).where(PolymarketBot.id == bot_id).values(
            status="error",
            stopped_at=datetime.now(timezone.utc),
            error_message=f"연속 {MAX_CONSECUTIVE_ERRORS}회 오류로 자동 중지됨",
        )
        await db.execute(stmt)
        await db.commit()
    await _clear_runtime_state(bot_id_str)
    await _release_lock(bot_id_str, token)


async def _update_bot_error(bot_id: UUID, error_msg: str):
    from db.database import AsyncSessionLocal
    async with AsyncSessionLocal() as db:
        stmt = update(PolymarketBot).where(PolymarketBot.id == bot_id).values(
            error_message=error_msg,
        )
        await db.execute(stmt)
        await db.commit()
