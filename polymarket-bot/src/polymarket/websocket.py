"""Polymarket WebSocket — real-time orderbook and trade events."""
from __future__ import annotations

import asyncio
import json
import logging
import time
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)

PM_WS_URL = "wss://ws-subscriptions-clob.polymarket.com/ws/market"


@dataclass
class OrderbookSnapshot:
    """Current best bid/ask for a token."""
    token_id: str
    best_bid: float = 0.0
    best_ask: float = 0.0
    bid_size: float = 0.0
    ask_size: float = 0.0
    updated_at: float = 0.0

    @property
    def midpoint(self) -> float:
        if self.best_bid > 0 and self.best_ask > 0:
            return (self.best_bid + self.best_ask) / 2
        return self.best_bid or self.best_ask

    @property
    def spread(self) -> float:
        if self.best_bid > 0 and self.best_ask > 0:
            return self.best_ask - self.best_bid
        return 0.0


class PolymarketWebSocket:
    """Real-time orderbook data from Polymarket CLOB WebSocket."""

    def __init__(self) -> None:
        self._subscriptions: set[str] = set()  # token_ids
        self._orderbooks: dict[str, OrderbookSnapshot] = {}
        self._connected: bool = False
        self._task: asyncio.Task | None = None
        self._running: bool = False
        self._ws = None

    @property
    def is_connected(self) -> bool:
        return self._connected

    def get_orderbook(self, token_id: str) -> OrderbookSnapshot | None:
        return self._orderbooks.get(token_id)

    async def start(self) -> None:
        if self._running:
            return
        self._running = True
        self._task = asyncio.create_task(self._ws_loop())
        logger.info("Polymarket WS starting...")

    async def stop(self) -> None:
        self._running = False
        self._connected = False
        if self._task and not self._task.done():
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        self._task = None
        logger.info("Polymarket WS stopped")

    async def subscribe(self, token_id: str) -> None:
        """Subscribe to orderbook updates for a token."""
        self._subscriptions.add(token_id)
        if self._ws and self._connected:
            await self._send_subscribe([token_id])

    async def unsubscribe(self, token_id: str) -> None:
        """Unsubscribe from a token's updates."""
        self._subscriptions.discard(token_id)
        self._orderbooks.pop(token_id, None)
        # Polymarket WS doesn't have explicit unsubscribe; just stop tracking

    async def subscribe_market(self, yes_token_id: str, no_token_id: str) -> None:
        """Subscribe to both sides of a market."""
        await self.subscribe(yes_token_id)
        await self.subscribe(no_token_id)

    async def _send_subscribe(self, token_ids: list[str]) -> None:
        if not self._ws:
            return
        for asset_id in token_ids:
            msg = {
                "auth": {},
                "markets": [asset_id],
                "assets_ids": [asset_id],
                "type": "market",
            }
            try:
                await self._ws.send(json.dumps(msg))
                logger.debug(f"PM WS: subscribed to {asset_id[:16]}...")
            except Exception as e:
                logger.warning(f"PM WS subscribe failed: {e}")

    async def _ws_loop(self) -> None:
        reconnect_wait = 1.0
        while self._running:
            try:
                await self._connect()
                reconnect_wait = 1.0
            except asyncio.CancelledError:
                break
            except Exception as e:
                self._connected = False
                logger.warning(f"PM WS error: {e}, reconnecting in {reconnect_wait:.1f}s")
                await asyncio.sleep(reconnect_wait)
                reconnect_wait = min(reconnect_wait * 2, 30.0)

    async def _connect(self) -> None:
        import websockets

        async with websockets.connect(PM_WS_URL, ping_interval=10, ping_timeout=30) as ws:
            self._ws = ws
            self._connected = True
            logger.info("Polymarket WS connected")

            # Re-subscribe to all tracked tokens
            if self._subscriptions:
                await self._send_subscribe(list(self._subscriptions))

            async for raw in ws:
                if not self._running:
                    break
                try:
                    msgs = json.loads(raw)
                    if not isinstance(msgs, list):
                        msgs = [msgs]
                    for msg in msgs:
                        self._handle_message(msg)
                except (json.JSONDecodeError, Exception) as e:
                    logger.debug(f"PM WS parse error: {e}")

        self._ws = None
        self._connected = False

    def _handle_message(self, msg: dict) -> None:
        """Process a single WebSocket message."""
        event_type = msg.get("event_type", "")
        asset_id = msg.get("asset_id", "")

        if not asset_id or asset_id not in self._subscriptions:
            return

        if event_type in ("book", "price_change", "tick_size_change"):
            # Update orderbook snapshot
            if asset_id not in self._orderbooks:
                self._orderbooks[asset_id] = OrderbookSnapshot(token_id=asset_id)

            ob = self._orderbooks[asset_id]

            # Parse changes array: [[price, size], ...]
            buys = msg.get("buys", [])
            sells = msg.get("sells", [])

            if buys:
                # Best bid = highest buy price
                best = max(buys, key=lambda x: float(x.get("price", 0)))
                ob.best_bid = float(best.get("price", 0))
                ob.bid_size = float(best.get("size", 0))

            if sells:
                # Best ask = lowest sell price
                best = min(sells, key=lambda x: float(x.get("price", 0)))
                ob.best_ask = float(best.get("price", 0))
                ob.ask_size = float(best.get("size", 0))

            ob.updated_at = time.time()

        elif event_type == "last_trade_price":
            price = msg.get("price")
            if price and asset_id in self._orderbooks:
                self._orderbooks[asset_id].updated_at = time.time()
