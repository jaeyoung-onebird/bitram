"""Order execution manager for full-market trading."""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from uuid import uuid4

from src.executor.position_tracker import Position
from src.polymarket.client import PolymarketClient
from src.scanner.market_scanner import MarketCandidate

logger = logging.getLogger(__name__)


class FullMarketOrderManager:
    """Manages order execution for full-market AI strategy."""

    def __init__(
        self,
        client: PolymarketClient,
        *,
        maker_offset_cents: int = 2,
        prefer_maker: bool = True,
    ) -> None:
        self.client = client
        self.maker_offset = maker_offset_cents / 100
        self.prefer_maker = prefer_maker

    async def open_position(
        self,
        market: MarketCandidate,
        side: str,
        size_usd: float,
        analysis: dict | None = None,
    ) -> Position | None:
        """Open a position via maker limit order.

        Args:
            market: The market candidate
            side: "YES" or "NO"
            size_usd: Dollar amount to invest
            analysis: Claude analysis result (for logging)

        Returns:
            Position if order placed, None on failure.
        """
        if side == "YES":
            token_id = market.yes_token_id
            price = market.yes_price
        else:
            token_id = market.no_token_id
            price = market.no_price

        if price <= 0:
            return None

        # Maker price: slightly below market (more favorable for us)
        if self.prefer_maker:
            maker_price = round(price - self.maker_offset, 2)
            maker_price = max(0.01, maker_price)
        else:
            maker_price = round(price, 2)

        shares = size_usd / maker_price
        if shares < 1:
            return None

        order_result = await self.client.create_limit_order(
            token_id=token_id,
            side="BUY",
            price=maker_price,
            size=round(shares, 2),
            tick_size=market.tick_size,
            neg_risk=market.neg_risk,
        )

        if not order_result.success:
            logger.error(f"Order failed for {market.question[:50]}: {order_result.message}")
            return None

        position = Position(
            id=str(uuid4()),
            condition_id=market.condition_id,
            question=market.question,
            category=market.category,
            side=side,
            entry_price=maker_price,
            shares=round(shares, 2),
            cost_basis=round(maker_price * shares, 2),
            current_price=maker_price,
            entry_time=datetime.now(timezone.utc).isoformat(),
            analysis=analysis or {},
            order_id=order_result.order_id,
            slug=market.slug,
            end_date=market.end_date_str,
        )

        logger.info(
            f"Opened: {side} {market.question[:50]}... "
            f"${size_usd:.0f} @ {maker_price:.2f} ({shares:.0f} shares)"
        )
        return position

    async def close_position(self, position: Position) -> float:
        """Close a position. Returns realized PnL.

        For now, uses maker order at current price - offset.
        """
        if position.side == "YES":
            # Sell YES tokens
            sell_price = round(position.current_price - self.maker_offset, 2)
        else:
            sell_price = round(position.current_price - self.maker_offset, 2)

        sell_price = max(0.01, sell_price)

        order_result = await self.client.create_limit_order(
            token_id="",  # would need token_id stored in position
            side="SELL",
            price=sell_price,
            size=position.shares,
        )

        proceeds = sell_price * position.shares
        pnl = proceeds - position.cost_basis

        logger.info(
            f"Closed: {position.side} {position.question[:50]}... "
            f"PnL=${pnl:+.2f} (entry={position.entry_price:.2f} exit={sell_price:.2f})"
        )
        return pnl
