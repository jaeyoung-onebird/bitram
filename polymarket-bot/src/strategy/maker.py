"""Maker strategy — place limit orders on the winning side of 5-min BTC markets."""
from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass

from src.binance.price_feed import BinancePriceFeed
from src.config import StrategyConfig, RiskConfig
from src.polymarket.client import PolymarketClient, OrderResult
from src.polymarket.market_finder import ActiveMarket
from src.polymarket.websocket import PolymarketWebSocket
from src.risk.manager import RiskManager
from src.strategy.probability import estimate_probability, calc_edge

logger = logging.getLogger(__name__)


@dataclass
class CycleResult:
    """Result of one market cycle."""
    market_slug: str
    entered: bool
    side: str = ""           # "YES" or "NO"
    entry_price: float = 0.0
    size: float = 0.0
    order_id: str = ""
    filled: bool = False
    exit_price: float = 0.0
    pnl: float = 0.0
    reason: str = ""


class MakerStrategy:
    """Core maker strategy for 5-min BTC Up/Down markets."""

    def __init__(
        self,
        client: PolymarketClient,
        price_feed: BinancePriceFeed,
        pm_ws: PolymarketWebSocket,
        risk_mgr: RiskManager,
        strategy_cfg: StrategyConfig,
        risk_cfg: RiskConfig,
    ) -> None:
        self.client = client
        self.price_feed = price_feed
        self.pm_ws = pm_ws
        self.risk_mgr = risk_mgr
        self.strategy_cfg = strategy_cfg
        self.risk_cfg = risk_cfg
        self._active_orders: dict[str, str] = {}  # token_id → order_id

    async def run_cycle(self, market: ActiveMarket) -> CycleResult:
        """Execute one full cycle for a 5-min market.

        1. Wait until entry window (T - entry_window_seconds)
        2. Monitor Binance price vs reference price
        3. When edge detected → place maker order on winning side
        4. Monitor for fill + requote if needed
        5. Cancel unfilled orders at T - cancel_window_seconds
        6. Log result
        """
        result = CycleResult(market_slug=market.slug, entered=False)
        cfg = self.strategy_cfg
        rcfg = self.risk_cfg

        # Risk check
        can_trade, deny_reason = self.risk_mgr.can_trade()
        if not can_trade:
            result.reason = f"risk_denied: {deny_reason}"
            logger.info(f"Skipping {market.slug}: {deny_reason}")
            return result

        # Subscribe to market WebSocket for real-time orderbook
        await self.pm_ws.subscribe_market(market.yes_token_id, market.no_token_id)

        # Reference price: BTC price at round start
        # Wait for round to start if it hasn't yet
        while market.seconds_remaining > market.duration_seconds:
            await asyncio.sleep(0.5)

        # Capture reference price at round start
        reference_price = self.price_feed.latest_price
        if reference_price <= 0:
            result.reason = "no_binance_price"
            logger.warning("No Binance price available, skipping")
            return result

        logger.info(
            f"Market {market.slug} started. "
            f"Reference BTC: ${reference_price:,.2f}, "
            f"Duration: {market.duration_seconds}s"
        )

        # Phase 1: Wait for entry window
        entry_start = market.duration_seconds - cfg.entry_window_seconds
        while market.seconds_remaining > cfg.entry_window_seconds:
            await asyncio.sleep(0.5)
            if not self.price_feed.is_connected:
                result.reason = "binance_disconnected"
                return result

        # Phase 2: Entry window — analyze and place orders
        logger.info(f"Entry window opened ({cfg.entry_window_seconds}s remaining)")

        placed_order_id = ""
        placed_token_id = ""
        placed_side = ""
        placed_price = 0.0
        placed_size = 0.0

        while market.seconds_remaining > cfg.cancel_window_seconds:
            current_price = self.price_feed.latest_price
            momentum = self.price_feed.price_change_pct(seconds=10)
            volatility = self.price_feed.volatility(seconds=60)

            # Estimate probability
            prob = estimate_probability(
                reference_price=reference_price,
                current_price=current_price,
                seconds_remaining=market.seconds_remaining,
                momentum_10s_pct=momentum,
                volatility_60s_pct=volatility,
            )

            # Determine which side to bet on
            if prob.up_probability > 0.5:
                # BTC likely ends above reference → buy YES
                our_prob = prob.up_probability
                token_id = market.yes_token_id
                side = "YES"
                market_price = market.yes_price
            else:
                # BTC likely ends below reference → buy NO
                our_prob = prob.down_probability
                token_id = market.no_token_id
                side = "NO"
                market_price = market.no_price

            # Update market price from WebSocket if available
            ob = self.pm_ws.get_orderbook(token_id)
            if ob and ob.best_ask > 0:
                market_price = ob.best_ask

            edge = calc_edge(our_prob, market_price)

            # Check if edge is sufficient
            if edge * 100 < rcfg.min_edge_pct:
                # No sufficient edge — wait
                if placed_order_id:
                    # Cancel existing order if edge disappeared
                    await self.client.cancel_order(placed_order_id)
                    placed_order_id = ""
                    logger.info(f"Cancelled order: edge dropped to {edge*100:.1f}%")
                await asyncio.sleep(0.5)
                continue

            # Calculate maker order price
            # Place below our estimated probability (maker = provide liquidity)
            maker_price = min(
                max(our_prob - 0.02, rcfg.min_price),  # slightly below our estimate
                rcfg.max_price,
            )
            maker_price = round(maker_price, 2)  # tick size 0.01

            # Ensure price is within target range
            if maker_price < cfg.target_price_range[0]:
                maker_price = cfg.target_price_range[0]
            if maker_price > cfg.target_price_range[1]:
                maker_price = cfg.target_price_range[1]

            size = min(cfg.order_size_shares, rcfg.max_position_size_usd / maker_price)

            # Check if we need to requote
            if placed_order_id:
                price_diff = abs(maker_price - placed_price) / placed_price * 100
                if price_diff < cfg.requote_threshold_pct:
                    # Price hasn't changed enough to requote
                    await asyncio.sleep(0.3)
                    continue
                # Cancel old order before placing new one
                await self.client.cancel_order(placed_order_id)
                placed_order_id = ""

            # Place maker order
            order_result = await self.client.create_limit_order(
                token_id=token_id,
                side="BUY",
                price=maker_price,
                size=size,
                tick_size=market.tick_size,
                neg_risk=market.neg_risk,
            )

            if order_result.success:
                placed_order_id = order_result.order_id
                placed_token_id = token_id
                placed_side = side
                placed_price = maker_price
                placed_size = size
                logger.info(
                    f"Placed maker {side} BUY @ ${maker_price:.2f} x {size:.0f} "
                    f"(edge={edge*100:.1f}%, prob={our_prob:.2%}, "
                    f"BTC=${current_price:,.2f}, ref=${reference_price:,.2f})"
                )

            await asyncio.sleep(0.3)  # check interval

        # Phase 3: Cancel window — cancel any unfilled orders
        if placed_order_id:
            await self.client.cancel_order(placed_order_id)
            logger.info(f"Cancel window: cancelled order {placed_order_id}")

        # Phase 4: Wait for settlement
        while market.seconds_remaining > 0:
            await asyncio.sleep(0.5)

        # Record result
        if placed_price > 0:
            result.entered = True
            result.side = placed_side
            result.entry_price = placed_price
            result.size = placed_size
            result.order_id = placed_order_id

            # Determine outcome
            final_price = self.price_feed.latest_price
            up_won = final_price > reference_price

            if (placed_side == "YES" and up_won) or (placed_side == "NO" and not up_won):
                # Won: payout is $1/share - entry price
                result.pnl = (1.0 - placed_price) * placed_size
                result.filled = True
                result.exit_price = 1.0
                result.reason = "WIN"
            else:
                # Lost: lose entry price
                result.pnl = -placed_price * placed_size
                result.filled = True
                result.exit_price = 0.0
                result.reason = "LOSS"

            self.risk_mgr.record_trade(result.pnl)
            logger.info(
                f"Result: {result.reason} {placed_side} "
                f"entry=${placed_price:.2f} pnl=${result.pnl:.2f} "
                f"(BTC final=${final_price:,.2f} vs ref=${reference_price:,.2f})"
            )
        else:
            result.reason = "no_edge"
            logger.info(f"No trade: insufficient edge throughout entry window")

        # Unsubscribe from market
        await self.pm_ws.unsubscribe(market.yes_token_id)
        await self.pm_ws.unsubscribe(market.no_token_id)

        return result
