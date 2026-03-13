"""Polymarket BTC 5-min Sniper Bot — simplified high-frequency strategy.

Strategy:
  1. Find the currently active BTC 5-min Up/Down market
  2. At T-30s before market end, compare Binance BTC price vs market start price
  3. If BTC > start → buy Up (Yes), if BTC < start → buy Down (No)
  4. Place maker (limit) order at ≤80¢, retry up to 85¢ if not filled
  5. Cancel unfilled orders at T-5s before market end
  6. Wait for next 5-min market and repeat

Usage:
  python -m src.main_sniper              # dry-run (default)
  python -m src.main_sniper --live       # real money
  python -m src.main_sniper --once       # single round then exit
"""
from __future__ import annotations

import argparse
import asyncio
import json
import signal
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import structlog

from src.binance.price_feed import BinancePriceFeed
from src.config import load_config, AppConfig
from src.polymarket.client import PolymarketClient, OrderResult
from src.polymarket.market_finder import (
    ActiveMarket,
    find_btc_5min_markets,
    find_current_btc_5min_market,
    find_next_btc_5min_market,
)

# ── Logging ──────────────────────────────────────────────────────────────

LOG_DIR = Path(__file__).resolve().parent.parent / "logs"

def setup_logging(level: str = "INFO") -> structlog.stdlib.BoundLogger:
    """Configure structlog with JSON + console output."""
    LOG_DIR.mkdir(exist_ok=True)

    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.dev.ConsoleRenderer(colors=True),
        ],
        wrapper_class=structlog.stdlib.BoundLogger,
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(),
    )
    return structlog.get_logger()

log = setup_logging()

# ── Trade logger ─────────────────────────────────────────────────────────

TRADES_FILE = LOG_DIR / "sniper_trades.jsonl"

def log_trade(entry: dict) -> None:
    """Append a trade record to sniper_trades.jsonl."""
    TRADES_FILE.parent.mkdir(exist_ok=True)
    entry["logged_at"] = datetime.now(timezone.utc).isoformat()
    with open(TRADES_FILE, "a") as f:
        f.write(json.dumps(entry, default=str) + "\n")

# ── Risk Manager ─────────────────────────────────────────────────────────

class SniperRisk:
    """Simple daily loss + circuit breaker."""

    def __init__(self, max_daily_loss: float = 20.0, circuit_breaker: int = 3):
        self.max_daily_loss = max_daily_loss
        self.circuit_breaker = circuit_breaker
        self._daily_loss: float = 0.0
        self._consecutive_losses: int = 0
        self._last_reset_date: str = ""

    def _check_day_reset(self) -> None:
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        if today != self._last_reset_date:
            self._daily_loss = 0.0
            self._consecutive_losses = 0
            self._last_reset_date = today
            log.info("risk.day_reset", date=today)

    def can_trade(self) -> bool:
        self._check_day_reset()
        if self._daily_loss >= self.max_daily_loss:
            log.warning("risk.daily_limit_reached", loss=self._daily_loss, limit=self.max_daily_loss)
            return False
        if self._consecutive_losses >= self.circuit_breaker:
            log.warning("risk.circuit_breaker", consecutive=self._consecutive_losses)
            return False
        return True

    def record_result(self, pnl: float) -> None:
        self._check_day_reset()
        if pnl < 0:
            self._daily_loss += abs(pnl)
            self._consecutive_losses += 1
        else:
            self._consecutive_losses = 0
        log.info("risk.record", pnl=f"{pnl:.2f}", daily_loss=f"{self._daily_loss:.2f}",
                 consec_losses=self._consecutive_losses)

# ── Sniper Strategy ──────────────────────────────────────────────────────

# Entry: T-30s before end. Cancel: T-5s before end.
ENTRY_WINDOW_SECS = 30
CANCEL_WINDOW_SECS = 5

# Price limits for maker orders
INITIAL_MAX_PRICE = 0.80  # first attempt
RETRY_MAX_PRICE = 0.85    # if not filled, retry up to here
ORDER_SIZE_SHARES = 50     # shares per order


class SniperBot:
    """BTC 5-min sniper: buy predicted outcome ~30s before market end."""

    def __init__(self, cfg: AppConfig) -> None:
        self.cfg = cfg
        self.price_feed = BinancePriceFeed()
        self.client = PolymarketClient(cfg.credentials, dry_run=cfg.dry_run)
        self.risk = SniperRisk(
            max_daily_loss=cfg.risk.max_daily_loss_usd,
            circuit_breaker=cfg.risk.circuit_breaker_losses,
        )
        self._running = True
        self._active_order: OrderResult | None = None
        self._stats = {"rounds": 0, "trades": 0, "wins": 0, "pnl": 0.0}

    async def start(self) -> None:
        """Start price feed and main loop."""
        await self.price_feed.start()

        # Wait for initial price
        for _ in range(50):
            if self.price_feed.latest_price > 0:
                break
            await asyncio.sleep(0.1)

        if self.price_feed.latest_price <= 0:
            log.error("binance.no_price", msg="Could not get BTC price from Binance")
            return

        log.info("sniper.started",
                 btc_price=f"${self.price_feed.latest_price:,.0f}",
                 mode="DRY RUN" if self.cfg.dry_run else "LIVE")

    async def stop(self) -> None:
        """Graceful shutdown: cancel orders, stop feeds."""
        self._running = False
        log.info("sniper.stopping")

        # Cancel any active order
        if self._active_order and self._active_order.order_id and self._active_order.order_id != "dry_run":
            await self.client.cancel_order(self._active_order.order_id)
            self._active_order = None

        await self.price_feed.stop()
        await self.client.close()

        log.info("sniper.stopped", stats=self._stats)

    async def run_loop(self) -> None:
        """Main loop: find market → wait → snipe → repeat."""
        while self._running:
            try:
                await self._run_one_cycle()
            except asyncio.CancelledError:
                break
            except Exception as e:
                log.error("sniper.cycle_error", error=str(e))
                await asyncio.sleep(5)

    async def _run_one_cycle(self) -> None:
        """Execute one snipe cycle."""
        # Risk check
        if not self.risk.can_trade():
            log.info("sniper.risk_block", msg="Waiting 60s due to risk limits")
            await asyncio.sleep(60)
            return

        # Find current or next market
        market = await find_current_btc_5min_market()

        if market is None:
            market = await find_next_btc_5min_market()
            if market is None:
                log.info("sniper.no_market", msg="No BTC 5-min markets found, retrying in 30s")
                await asyncio.sleep(30)
                return

        remaining = market.seconds_remaining

        # If market ends in more than ENTRY_WINDOW_SECS, wait
        if remaining > ENTRY_WINDOW_SECS:
            wait_for = remaining - ENTRY_WINDOW_SECS
            log.info("sniper.waiting",
                     market=market.question,
                     remaining=f"{remaining:.0f}s",
                     wait=f"{wait_for:.0f}s",
                     end_time=market.end_time.isoformat())
            await self._interruptible_sleep(wait_for)
            if not self._running:
                return

        # Refresh remaining time
        remaining = market.seconds_remaining
        if remaining <= CANCEL_WINDOW_SECS:
            log.info("sniper.too_late", remaining=f"{remaining:.0f}s")
            await asyncio.sleep(2)
            return

        # ── Determine direction ──────────────────────────────────────
        btc_now = self.price_feed.latest_price
        if btc_now <= 0:
            log.warning("sniper.no_btc_price")
            return

        # Infer start price from question or use market midpoint as baseline
        # For BTC 5-min Up/Down:
        #   "Up" wins if BTC goes up → buy Yes token
        #   "Down" wins if BTC goes down → buy No token (which is the "Down" outcome)
        # Market question typically: "Will BTC go up in this 5 min window?"
        # Yes = Up, No = Down

        # Use 5-minute price change to decide direction
        price_change = self.price_feed.price_change_pct(seconds=240)  # 4-min window

        if abs(price_change) < 0.01:
            log.info("sniper.no_signal", price_change_pct=f"{price_change:.4f}%",
                     msg="Price too flat, skipping")
            await asyncio.sleep(remaining + 1)
            return

        # Direction: positive change → BTC going up → buy Yes (Up)
        # Negative change → BTC going down → buy No (Down)
        if price_change > 0:
            direction = "UP"
            token_id = market.yes_token_id
            current_price = market.yes_price
        else:
            direction = "DOWN"
            token_id = market.no_token_id
            current_price = market.no_price

        log.info("sniper.signal",
                 direction=direction,
                 btc_price=f"${btc_now:,.2f}",
                 price_change=f"{price_change:+.3f}%",
                 market_price=f"{current_price:.2f}",
                 remaining=f"{remaining:.0f}s")

        # ── Place order ──────────────────────────────────────────────
        order_price = min(current_price, INITIAL_MAX_PRICE)
        # Round to tick size
        tick = float(market.tick_size)
        order_price = round(order_price / tick) * tick

        if order_price <= 0 or order_price > INITIAL_MAX_PRICE:
            order_price = INITIAL_MAX_PRICE

        self._stats["rounds"] += 1

        result = await self.client.create_limit_order(
            token_id=token_id,
            side="BUY",
            price=order_price,
            size=ORDER_SIZE_SHARES,
            tick_size=market.tick_size,
            neg_risk=market.neg_risk,
        )
        self._active_order = result

        if not result.success:
            log.error("sniper.order_failed", error=result.message)
            return

        log.info("sniper.order_placed",
                 order_id=result.order_id,
                 direction=direction,
                 price=f"{order_price:.2f}",
                 size=ORDER_SIZE_SHARES)

        # ── Wait for fill or cancel window ───────────────────────────
        filled = await self._wait_for_fill_or_cancel(market, result)

        # ── Retry at higher price if not filled ──────────────────────
        if not filled and market.seconds_remaining > CANCEL_WINDOW_SECS + 3:
            retry_price = min(order_price + 0.05, RETRY_MAX_PRICE)
            retry_price = round(retry_price / tick) * tick

            log.info("sniper.retry", new_price=f"{retry_price:.2f}")

            # Cancel old order
            if result.order_id and result.order_id != "dry_run":
                await self.client.cancel_order(result.order_id)

            result = await self.client.create_limit_order(
                token_id=token_id,
                side="BUY",
                price=retry_price,
                size=ORDER_SIZE_SHARES,
                tick_size=market.tick_size,
                neg_risk=market.neg_risk,
            )
            self._active_order = result

            if result.success:
                log.info("sniper.retry_placed", order_id=result.order_id, price=f"{retry_price:.2f}")
                filled = await self._wait_for_fill_or_cancel(market, result)

        # ── Cancel if still unfilled at T-5s ─────────────────────────
        if not filled and self._active_order:
            if self._active_order.order_id and self._active_order.order_id != "dry_run":
                await self.client.cancel_order(self._active_order.order_id)
            log.info("sniper.cancelled_unfilled")
            self._active_order = None

        # ── Record trade ─────────────────────────────────────────────
        if filled or self.cfg.dry_run:
            # In dry-run, assume fill at order price for tracking
            cost = order_price * ORDER_SIZE_SHARES
            # Assume win if our direction prediction holds (simplified P&L)
            # Real P&L tracked on market resolution
            self._stats["trades"] += 1

            trade_record = {
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "market": market.question,
                "slug": market.slug,
                "condition_id": market.condition_id,
                "direction": direction,
                "token_id": token_id,
                "order_price": order_price,
                "size": ORDER_SIZE_SHARES,
                "cost_usdc": cost,
                "btc_price": btc_now,
                "price_change_pct": price_change,
                "order_id": result.order_id if result else "",
                "filled": filled or self.cfg.dry_run,
                "mode": "dry_run" if self.cfg.dry_run else "live",
            }
            log_trade(trade_record)
            log.info("sniper.trade_logged", direction=direction, cost=f"${cost:.2f}")

        # Wait for market to end before next cycle
        await self._interruptible_sleep(max(0, market.seconds_remaining + 2))

    async def _wait_for_fill_or_cancel(self, market: ActiveMarket, order: OrderResult) -> bool:
        """Wait until filled or cancel window approached. Returns True if filled."""
        if self.cfg.dry_run:
            # Simulate fill in dry-run
            await asyncio.sleep(1)
            return True

        check_interval = 2.0
        while self._running:
            remaining = market.seconds_remaining
            if remaining <= CANCEL_WINDOW_SECS:
                return False

            # Check if order is still open
            try:
                open_orders = await self.client.get_open_orders()
                still_open = any(o.get("id") == order.order_id or o.get("orderID") == order.order_id
                                 for o in open_orders)
                if not still_open:
                    log.info("sniper.filled", order_id=order.order_id)
                    return True
            except Exception as e:
                log.warning("sniper.check_error", error=str(e))

            await asyncio.sleep(check_interval)

        return False

    async def _interruptible_sleep(self, seconds: float) -> None:
        """Sleep that can be interrupted by stop signal."""
        end = time.time() + seconds
        while self._running and time.time() < end:
            await asyncio.sleep(min(1.0, end - time.time()))


# ── Main ─────────────────────────────────────────────────────────────────

async def main(args: argparse.Namespace) -> None:
    cfg = load_config(dry_run=not args.live)

    bot = SniperBot(cfg)
    loop = asyncio.get_running_loop()

    # Graceful shutdown on Ctrl+C
    shutdown_event = asyncio.Event()

    def _signal_handler():
        log.info("sniper.interrupt", msg="Ctrl+C received, shutting down...")
        shutdown_event.set()

    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, _signal_handler)
        except NotImplementedError:
            # Windows doesn't support add_signal_handler
            signal.signal(sig, lambda s, f: _signal_handler())

    try:
        await bot.start()

        if args.once:
            # Single cycle
            await bot._run_one_cycle()
        else:
            # Run until interrupted
            run_task = asyncio.create_task(bot.run_loop())
            await shutdown_event.wait()
            bot._running = False
            run_task.cancel()
            try:
                await run_task
            except asyncio.CancelledError:
                pass
    finally:
        await bot.stop()

    # Print summary
    s = bot._stats
    print(f"\n{'='*50}")
    print(f"  Sniper Session Summary")
    print(f"  Mode: {'DRY RUN' if cfg.dry_run else 'LIVE'}")
    print(f"  Rounds: {s['rounds']}")
    print(f"  Trades: {s['trades']}")
    print(f"  Wins: {s['wins']}")
    print(f"  P&L: ${s['pnl']:.2f}")
    print(f"{'='*50}\n")


def cli() -> None:
    parser = argparse.ArgumentParser(
        description="Polymarket BTC 5-min Sniper Bot",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python -m src.main_sniper              # dry-run (default, safe)
  python -m src.main_sniper --live       # real trading (caution!)
  python -m src.main_sniper --once       # single round then exit
  python -m src.main_sniper --once --live  # single live round
        """,
    )
    parser.add_argument("--live", action="store_true", help="Enable live trading (real money)")
    parser.add_argument("--once", action="store_true", help="Run a single cycle then exit")
    args = parser.parse_args()

    if args.live:
        print("\n⚠️  LIVE MODE — real money will be used!")
        print("   Press Ctrl+C at any time to cancel orders and exit.\n")

    asyncio.run(main(args))


if __name__ == "__main__":
    cli()
