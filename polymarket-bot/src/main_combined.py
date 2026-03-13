"""Combined dual-strategy bot — BTC maker + full-market AI analysis.

Capital allocation: 40% BTC maker (supplementary) / 60% full-market AI (primary).
Both strategies run concurrently with a shared risk manager.

Usage:
  python -m src.main_combined --dry-run          # simulate (default)
  python -m src.main_combined --live              # real money
  python -m src.main_combined --scan-only         # AI scan only, no orders
  python -m src.main_combined --maker-only        # BTC maker only
  python -m src.main_combined --fullmarket-only   # AI analysis only
"""
from __future__ import annotations

import argparse
import asyncio
import json
import logging
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

from src.analyst.claude_analyst import ClaudeAnalyst
from src.analyst.edge_calculator import half_kelly_bet
from src.binance.price_feed import BinancePriceFeed
from src.config import load_config
from src.executor.order_manager import FullMarketOrderManager
from src.executor.position_tracker import PositionTracker
from src.monitor.news_monitor import NewsMonitor
from src.polymarket.client import PolymarketClient
from src.polymarket.market_finder import find_current_btc_5min_market, find_next_btc_5min_market
from src.polymarket.websocket import PolymarketWebSocket
from src.risk.manager import RiskManager
from src.scanner.market_scanner import scan_all_markets
from src.strategy.maker import MakerStrategy
from src.utils.logger import setup_logging

logger = logging.getLogger(__name__)

POSITIONS_FILE = "data/positions.json"
ANALYSIS_LOG = "logs/analysis.jsonl"

# Capital allocation
MAKER_CAPITAL_PCT = 0.40
FULLMARKET_CAPITAL_PCT = 0.60
TOTAL_BANKROLL = 500.0  # $500 default


async def run_maker_loop(
    client: PolymarketClient,
    price_feed: BinancePriceFeed,
    pm_ws: PolymarketWebSocket,
    risk_mgr: RiskManager,
    cfg,
    *,
    bankroll: float,
    dry_run: bool,
) -> None:
    """BTC 5-min maker strategy loop (40% capital)."""
    strategy = MakerStrategy(
        client=client,
        price_feed=price_feed,
        pm_ws=pm_ws,
        risk_mgr=risk_mgr,
        strategy_cfg=cfg.strategy,
        risk_cfg=cfg.risk,
    )

    logger.info(f"[MAKER] Starting with ${bankroll:.0f} bankroll")
    cycle = 0

    while True:
        can_trade, reason = risk_mgr.can_trade()
        if not can_trade:
            logger.warning(f"[MAKER] Blocked: {reason}. Waiting 60s...")
            await asyncio.sleep(60)
            continue

        current = await find_current_btc_5min_market()
        if current:
            logger.info(
                f"[MAKER] Active: {current.question} "
                f"({current.seconds_remaining:.0f}s left)"
            )
            result = await strategy.run_cycle(current)
            cycle += 1
            logger.info(f"[MAKER] Cycle #{cycle}: {result.reason} PnL=${result.pnl:+.2f}")
            continue

        next_market = await find_next_btc_5min_market()
        if next_market:
            wait = next_market.seconds_remaining - next_market.duration_seconds
            if wait > 0:
                logger.info(f"[MAKER] Next market in {wait / 60:.1f} min")
                await asyncio.sleep(min(wait, 30))
                continue

        await asyncio.sleep(30)


async def run_fullmarket_loop(
    client: PolymarketClient,
    analyst: ClaudeAnalyst,
    position_tracker: PositionTracker,
    news_monitor: NewsMonitor,
    risk_mgr: RiskManager,
    *,
    bankroll: float,
    scan_only: bool,
    dry_run: bool,
) -> None:
    """Full-market AI analysis loop (60% capital)."""
    order_mgr = FullMarketOrderManager(client)
    scan_interval = 15 * 60
    min_bet = 5.0

    logger.info(f"[AI] Starting with ${bankroll:.0f} bankroll (scan_only={scan_only})")
    Path(ANALYSIS_LOG).parent.mkdir(parents=True, exist_ok=True)

    while True:
        logger.info("[AI] --- Scan cycle ---")

        can_trade, reason = risk_mgr.can_trade()
        if not can_trade:
            logger.warning(f"[AI] Blocked: {reason}. Waiting 5 min...")
            await asyncio.sleep(300)
            continue

        # Scan markets
        candidates = await scan_all_markets()
        logger.info(f"[AI] Found {len(candidates)} candidates")

        analyzed = 0
        traded = 0

        for market in candidates:
            if position_tracker.has_position(market.condition_id):
                continue

            if position_tracker.get_total_exposure() >= bankroll:
                logger.info(f"[AI] Max exposure ${bankroll:.0f} reached")
                break

            # Claude analysis
            analysis = await analyst.estimate_probability(
                question=market.question,
                description=market.description,
                yes_price=market.yes_price,
                no_price=market.no_price,
                category=market.category,
                end_date=market.end_date_str,
            )
            analyzed += 1
            _log_analysis(market, analysis)

            if analysis.recommended_side == "SKIP":
                continue

            if scan_only:
                logger.info(
                    f"[AI] [SCAN] Would trade: {analysis.recommended_side} "
                    f"{market.question[:50]}... "
                    f"edge={analysis.edge:.1%} kelly={analysis.kelly_fraction:.1%}"
                )
                continue

            # Position sizing
            remaining = bankroll - position_tracker.get_total_exposure()
            bet_price = market.yes_price if analysis.recommended_side == "YES" else market.no_price
            bet_size = half_kelly_bet(
                my_probability=analysis.probability if analysis.recommended_side == "YES" else (1 - analysis.probability),
                market_price=bet_price,
                bankroll=remaining,
                side=analysis.recommended_side,
                max_position_pct=0.15,
            )

            if bet_size < min_bet:
                continue

            position = await order_mgr.open_position(
                market=market,
                side=analysis.recommended_side,
                size_usd=bet_size,
                analysis={
                    "probability": analysis.probability,
                    "confidence": analysis.confidence,
                    "edge": analysis.edge,
                    "reasoning": analysis.reasoning,
                },
            )

            if position:
                position_tracker.add(position)
                traded += 1

            await asyncio.sleep(90)

        # News monitor for existing positions
        alerts = await news_monitor.check_positions()
        close_alerts = news_monitor.get_pending_closes()
        for alert in close_alerts:
            logger.warning(
                f"[AI] NEWS CLOSE: {alert.question[:50]}... "
                f"P shifted {alert.probability_shift:.0%} {alert.direction}"
            )
            # Auto-close adverse positions
            pos = position_tracker.remove(alert.condition_id)
            if pos:
                pnl = await order_mgr.close_position(pos)
                position_tracker.record_close(pnl)
                risk_mgr.record_trade(pnl)
            news_monitor.clear_alerts_for(alert.condition_id)

        # Save state
        position_tracker.save_to_file(POSITIONS_FILE)

        summary = position_tracker.get_portfolio_summary()
        logger.info(
            f"[AI] Cycle done: analyzed={analyzed}, traded={traded}, "
            f"positions={summary['open_positions']}, "
            f"exposure=${summary['total_exposure']:.0f}, "
            f"PnL=${summary['total_pnl']:+.2f}"
        )

        logger.info(f"[AI] Next scan in {scan_interval // 60} min")
        await asyncio.sleep(scan_interval)


def _log_analysis(market, analysis) -> None:
    try:
        entry = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "condition_id": market.condition_id,
            "question": market.question,
            "category": market.category,
            "market_yes_price": market.yes_price,
            "claude_probability": analysis.probability,
            "claude_confidence": analysis.confidence,
            "edge": analysis.edge,
            "recommended_side": analysis.recommended_side,
            "kelly_fraction": analysis.kelly_fraction,
            "reasoning": analysis.reasoning,
            "end_date": market.end_date_str,
        }
        with open(ANALYSIS_LOG, "a") as f:
            f.write(json.dumps(entry) + "\n")
    except Exception:
        pass


async def main(
    dry_run: bool = True,
    scan_only: bool = False,
    maker_only: bool = False,
    fullmarket_only: bool = False,
) -> None:
    cfg = load_config(dry_run=dry_run)
    setup_logging(level=cfg.monitoring.log_level, log_file=cfg.monitoring.log_file)

    mode_parts = []
    if scan_only:
        mode_parts.append("SCAN ONLY")
    elif dry_run:
        mode_parts.append("DRY RUN")
    else:
        mode_parts.append("LIVE")

    if maker_only:
        mode_parts.append("MAKER ONLY")
    elif fullmarket_only:
        mode_parts.append("FULLMARKET ONLY")
    else:
        mode_parts.append("DUAL STRATEGY")

    logger.info(f"=== Combined Bot ({' / '.join(mode_parts)}) ===")

    # Credentials check
    api_key = os.getenv("ANTHROPIC_API_KEY", "")
    if not api_key and not maker_only:
        logger.error("ANTHROPIC_API_KEY not set — required for AI analysis")
        sys.exit(1)

    if not cfg.credentials.private_key and not scan_only:
        logger.warning("PRIVATE_KEY not set — orders will fail in live mode")

    # Shared components
    client = PolymarketClient(cfg.credentials, dry_run=dry_run or scan_only)
    risk_mgr = RiskManager(cfg.risk)

    # Capital allocation
    maker_bankroll = TOTAL_BANKROLL * MAKER_CAPITAL_PCT
    fullmarket_bankroll = TOTAL_BANKROLL * FULLMARKET_CAPITAL_PCT

    logger.info(
        f"Capital: total=${TOTAL_BANKROLL:.0f} "
        f"(maker=${maker_bankroll:.0f}, AI=${fullmarket_bankroll:.0f})"
    )

    tasks: list[asyncio.Task] = []

    try:
        # Maker strategy
        if not fullmarket_only and not scan_only:
            price_feed = BinancePriceFeed()
            pm_ws = PolymarketWebSocket()
            await price_feed.start()
            await pm_ws.start()

            # Wait for price
            for _ in range(50):
                if price_feed.latest_price > 0:
                    break
                await asyncio.sleep(0.1)

            if price_feed.latest_price > 0:
                logger.info(f"BTC price: ${price_feed.latest_price:,.2f}")
                maker_task = asyncio.create_task(
                    run_maker_loop(
                        client, price_feed, pm_ws, risk_mgr, cfg,
                        bankroll=maker_bankroll, dry_run=dry_run,
                    ),
                    name="maker",
                )
                tasks.append(maker_task)
            else:
                logger.warning("No BTC price — maker strategy disabled")

        # Full-market AI strategy
        if not maker_only:
            analyst = ClaudeAnalyst(
                api_key=api_key,
                model="claude-sonnet-4-20250514",
                max_calls_per_hour=40,
                min_edge_pct=10.0,
                min_confidence=0.6,
                use_web_search=True,
                dry_run=dry_run,
            )
            position_tracker = PositionTracker()
            position_tracker.load_from_file(POSITIONS_FILE)

            news_monitor = NewsMonitor(
                analyst=analyst,
                position_tracker=position_tracker,
                reeval_interval_minutes=60,
                alert_threshold_pct=15.0,
                close_threshold_pct=25.0,
            )

            fullmarket_task = asyncio.create_task(
                run_fullmarket_loop(
                    client, analyst, position_tracker, news_monitor, risk_mgr,
                    bankroll=fullmarket_bankroll, scan_only=scan_only, dry_run=dry_run,
                ),
                name="fullmarket",
            )
            tasks.append(fullmarket_task)

        if not tasks:
            logger.error("No strategies enabled")
            return

        logger.info(f"Running {len(tasks)} strategy tasks: {[t.get_name() for t in tasks]}")

        # Wait for any task to complete (or fail)
        done, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_EXCEPTION)

        # If a task raised, log it
        for t in done:
            if t.exception():
                logger.error(f"Task {t.get_name()} failed: {t.exception()}")

        # Cancel remaining
        for t in pending:
            t.cancel()
            try:
                await t
            except asyncio.CancelledError:
                pass

    except asyncio.CancelledError:
        logger.info("Cancelled")
    except KeyboardInterrupt:
        logger.info("Keyboard interrupt")
    finally:
        # Cancel all tasks
        for t in tasks:
            if not t.done():
                t.cancel()

        await client.cancel_all()
        await client.close()
        logger.info("=== Session ended ===")
        logger.info(f"Risk summary: {risk_mgr.summary}")


def cli() -> None:
    parser = argparse.ArgumentParser(description="Combined Dual-Strategy Bot")
    parser.add_argument("--dry-run", action="store_true", default=True)
    parser.add_argument("--live", action="store_true")
    parser.add_argument("--scan-only", action="store_true", help="Scan and analyze only")
    parser.add_argument("--maker-only", action="store_true", help="BTC maker only")
    parser.add_argument("--fullmarket-only", action="store_true", help="AI analysis only")
    args = parser.parse_args()

    dry_run = not args.live
    asyncio.run(main(
        dry_run=dry_run,
        scan_only=args.scan_only,
        maker_only=args.maker_only,
        fullmarket_only=args.fullmarket_only,
    ))


if __name__ == "__main__":
    cli()
