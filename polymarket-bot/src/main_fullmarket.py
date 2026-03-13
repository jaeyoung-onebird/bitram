"""Full-market AI analysis auto-trading — Claude scans all markets for mispricing.

Usage:
  python -m src.main_fullmarket --dry-run          # simulate (default)
  python -m src.main_fullmarket --live              # real money
  python -m src.main_fullmarket --scan-only         # scan + analyze, no orders
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
from src.config import load_config
from src.executor.order_manager import FullMarketOrderManager
from src.executor.position_tracker import PositionTracker
from src.polymarket.client import PolymarketClient
from src.risk.manager import RiskManager
from src.scanner.market_scanner import scan_all_markets
from src.utils.logger import setup_logging

logger = logging.getLogger(__name__)

POSITIONS_FILE = "data/positions.json"
ANALYSIS_LOG = "logs/analysis.jsonl"


async def main(dry_run: bool = True, scan_only: bool = False) -> None:
    cfg = load_config(dry_run=dry_run)
    setup_logging(level=cfg.monitoring.log_level, log_file=cfg.monitoring.log_file)

    mode = "SCAN ONLY" if scan_only else ("DRY RUN" if dry_run else "LIVE")
    logger.info(f"=== Full-Market AI Trader ({mode}) ===")

    # Claude API key
    api_key = os.getenv("ANTHROPIC_API_KEY", "")
    if not api_key:
        logger.error("ANTHROPIC_API_KEY not set — Claude analysis requires it")
        sys.exit(1)

    # Initialize components
    client = PolymarketClient(cfg.credentials, dry_run=dry_run or scan_only)
    analyst = ClaudeAnalyst(
        api_key=api_key,
        model="claude-sonnet-4-20250514",
        max_calls_per_hour=40,
        min_edge_pct=10.0,
        min_confidence=0.6,
        use_web_search=True,
        dry_run=dry_run,
    )
    order_mgr = FullMarketOrderManager(client)
    position_tracker = PositionTracker()
    risk_mgr = RiskManager(cfg.risk)

    # Load saved positions
    position_tracker.load_from_file(POSITIONS_FILE)

    # Ensure analysis log dir exists
    Path(ANALYSIS_LOG).parent.mkdir(parents=True, exist_ok=True)

    scan_interval = 15 * 60  # 15 minutes
    max_total_exposure = 300.0  # $300 max
    min_bet = 5.0  # minimum $5

    try:
        while True:
            logger.info("--- Scan cycle starting ---")

            # Risk check
            can_trade, reason = risk_mgr.can_trade()
            if not can_trade:
                logger.warning(f"Trading blocked: {reason}. Waiting 5 min...")
                await asyncio.sleep(300)
                continue

            # Scan markets
            candidates = await scan_all_markets()
            logger.info(f"Found {len(candidates)} candidate markets")

            analyzed = 0
            traded = 0

            for market in candidates:
                # Skip if already in portfolio
                if position_tracker.has_position(market.condition_id):
                    continue

                # Exposure check
                if position_tracker.get_total_exposure() >= max_total_exposure:
                    logger.info(f"Max exposure reached (${max_total_exposure}), stopping scan")
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

                # Log analysis result
                _log_analysis(market, analysis)

                if analysis.recommended_side == "SKIP":
                    continue

                if scan_only:
                    logger.info(
                        f"[SCAN] Would trade: {analysis.recommended_side} "
                        f"{market.question[:50]}... "
                        f"edge={analysis.edge:.1%} kelly={analysis.kelly_fraction:.1%}"
                    )
                    continue

                # Calculate position size
                bankroll = max_total_exposure - position_tracker.get_total_exposure()
                bet_price = market.yes_price if analysis.recommended_side == "YES" else market.no_price
                bet_size = half_kelly_bet(
                    my_probability=analysis.probability if analysis.recommended_side == "YES" else (1 - analysis.probability),
                    market_price=bet_price,
                    bankroll=bankroll,
                    side=analysis.recommended_side,
                    max_position_pct=0.15,
                )

                if bet_size < min_bet:
                    continue

                # Execute
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

                # API rate limit: ~90s between calls for 40/hour
                await asyncio.sleep(90)

            # Save positions
            position_tracker.save_to_file(POSITIONS_FILE)

            # Summary
            summary = position_tracker.get_portfolio_summary()
            logger.info(
                f"Cycle done: analyzed={analyzed}, traded={traded}, "
                f"positions={summary['open_positions']}, "
                f"exposure=${summary['total_exposure']:.0f}, "
                f"PnL=${summary['total_pnl']:+.2f}"
            )

            logger.info(f"Next scan in {scan_interval // 60} minutes...")
            await asyncio.sleep(scan_interval)

    except asyncio.CancelledError:
        logger.info("Cancelled")
    except KeyboardInterrupt:
        logger.info("Keyboard interrupt")
    finally:
        position_tracker.save_to_file(POSITIONS_FILE)
        await client.cancel_all()
        await client.close()
        logger.info(f"=== Session ended ===")
        for k, v in position_tracker.get_portfolio_summary().items():
            logger.info(f"  {k}: {v}")


def _log_analysis(market, analysis) -> None:
    """Append analysis to JSONL log file for later evaluation."""
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


def cli() -> None:
    parser = argparse.ArgumentParser(description="Full-Market AI Trader")
    parser.add_argument("--dry-run", action="store_true", default=True)
    parser.add_argument("--live", action="store_true")
    parser.add_argument("--scan-only", action="store_true", help="Scan and analyze only, no orders")
    args = parser.parse_args()

    dry_run = not args.live
    asyncio.run(main(dry_run=dry_run, scan_only=args.scan_only))


if __name__ == "__main__":
    cli()
