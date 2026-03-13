"""Main entry point — 5-minute BTC maker bot.

Usage:
  python -m src.main --dry-run       # simulate (default)
  python -m src.main --live          # real money
  python -m src.main --dry-run --once  # one cycle then exit
"""
from __future__ import annotations

import argparse
import asyncio
import logging
import signal
import sys

from src.binance.price_feed import BinancePriceFeed
from src.config import load_config
from src.polymarket.client import PolymarketClient
from src.polymarket.market_finder import find_current_btc_5min_market, find_next_btc_5min_market
from src.polymarket.websocket import PolymarketWebSocket
from src.risk.manager import RiskManager
from src.strategy.maker import MakerStrategy
from src.utils.logger import setup_logging

logger = logging.getLogger(__name__)


async def main(dry_run: bool = True, once: bool = False) -> None:
    cfg = load_config(dry_run=dry_run)
    setup_logging(level=cfg.monitoring.log_level, log_file=cfg.monitoring.log_file)

    mode = "DRY RUN" if dry_run else "LIVE"
    logger.info(f"=== Polymarket 5-min BTC Maker Bot ({mode}) ===")

    if not cfg.credentials.private_key:
        logger.error("PRIVATE_KEY not set in .env — cannot start")
        sys.exit(1)

    # Initialize components
    client = PolymarketClient(cfg.credentials, dry_run=dry_run)
    price_feed = BinancePriceFeed()
    pm_ws = PolymarketWebSocket()
    risk_mgr = RiskManager(cfg.risk)
    strategy = MakerStrategy(
        client=client,
        price_feed=price_feed,
        pm_ws=pm_ws,
        risk_mgr=risk_mgr,
        strategy_cfg=cfg.strategy,
        risk_cfg=cfg.risk,
    )

    # Verify connection
    if not dry_run:
        ok = await client.verify_connection()
        if not ok:
            logger.error("Polymarket API connection failed — check credentials")
            sys.exit(1)
        logger.info("Polymarket API connected ✓")

    # Start price feeds
    await price_feed.start()
    await pm_ws.start()

    # Wait for first price
    for _ in range(50):  # 5 seconds max
        if price_feed.latest_price > 0:
            break
        await asyncio.sleep(0.1)

    if price_feed.latest_price <= 0:
        logger.error("No BTC price received from Binance after 5s")
        await _shutdown(client, price_feed, pm_ws)
        sys.exit(1)

    logger.info(f"BTC price: ${price_feed.latest_price:,.2f}")

    # Main loop
    try:
        cycle_count = 0
        while True:
            # Check risk limits
            can_trade, reason = risk_mgr.can_trade()
            if not can_trade:
                logger.warning(f"Cannot trade: {reason}. Waiting 60s...")
                await asyncio.sleep(60)
                continue

            # Find current or next market
            current = await find_current_btc_5min_market()
            if current:
                logger.info(
                    f"Active market: {current.question} "
                    f"({current.seconds_remaining:.0f}s left)"
                )
                result = await strategy.run_cycle(current)
                cycle_count += 1
                logger.info(
                    f"Cycle #{cycle_count} result: {result.reason} "
                    f"PnL=${result.pnl:+.2f}"
                )

                if once:
                    logger.info("--once flag: exiting after 1 cycle")
                    break
                continue

            # No active market — find next one
            next_market = await find_next_btc_5min_market()
            if next_market:
                wait = next_market.seconds_remaining - next_market.duration_seconds
                if wait > 0:
                    wait_min = wait / 60
                    logger.info(f"Next market in {wait_min:.1f} min, waiting...")
                    # Sleep in small increments so we can catch Ctrl+C
                    for _ in range(int(wait)):
                        await asyncio.sleep(1)
                    continue

            # No markets at all
            logger.info("No 5-min BTC markets found. Retrying in 30s...")
            await asyncio.sleep(30)

    except asyncio.CancelledError:
        logger.info("Bot cancelled")
    except KeyboardInterrupt:
        logger.info("Keyboard interrupt")
    finally:
        logger.info("Shutting down...")
        # Cancel all orders on shutdown
        await client.cancel_all()
        await _shutdown(client, price_feed, pm_ws)

    # Print summary
    logger.info(f"=== Session Summary ===")
    for k, v in risk_mgr.summary.items():
        logger.info(f"  {k}: {v}")


async def _shutdown(
    client: PolymarketClient,
    price_feed: BinancePriceFeed,
    pm_ws: PolymarketWebSocket,
) -> None:
    await price_feed.stop()
    await pm_ws.stop()
    await client.close()


def cli() -> None:
    parser = argparse.ArgumentParser(description="Polymarket 5-min BTC Maker Bot")
    parser.add_argument("--dry-run", action="store_true", default=True, help="Simulate only (default)")
    parser.add_argument("--live", action="store_true", help="Real money trading")
    parser.add_argument("--once", action="store_true", help="Run one cycle then exit")
    args = parser.parse_args()

    dry_run = not args.live
    asyncio.run(main(dry_run=dry_run, once=args.once))


if __name__ == "__main__":
    cli()
