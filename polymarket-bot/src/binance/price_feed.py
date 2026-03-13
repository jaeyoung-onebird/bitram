"""Binance WebSocket — real-time BTC/USDT price stream."""
from __future__ import annotations

import asyncio
import json
import logging
import time
from collections import deque

logger = logging.getLogger(__name__)

BINANCE_WS_URL = "wss://stream.binance.com:9443/ws/btcusdt@trade"
MAX_RECONNECT = 5
RECONNECT_BACKOFF = 1.0


class BinancePriceFeed:
    """Real-time BTC/USDT price from Binance trade stream."""

    def __init__(self) -> None:
        self._latest_price: float = 0.0
        self._latest_time: float = 0.0
        self._price_history: deque[tuple[float, float]] = deque(maxlen=600)  # (ts, price)
        self._connected: bool = False
        self._task: asyncio.Task | None = None
        self._running: bool = False

    @property
    def latest_price(self) -> float:
        return self._latest_price

    @property
    def is_connected(self) -> bool:
        return self._connected and (time.time() - self._latest_time) < 5.0

    def price_change_pct(self, seconds: int = 10) -> float:
        """Price change % over the last N seconds."""
        if not self._price_history:
            return 0.0
        now = time.time()
        cutoff = now - seconds
        old_price = None
        for ts, price in self._price_history:
            if ts >= cutoff:
                old_price = price
                break
        if old_price is None or old_price == 0:
            return 0.0
        return (self._latest_price - old_price) / old_price * 100

    def moving_average(self, seconds: int = 10) -> float:
        """Simple moving average over last N seconds."""
        if not self._price_history:
            return self._latest_price
        now = time.time()
        cutoff = now - seconds
        prices = [p for ts, p in self._price_history if ts >= cutoff]
        if not prices:
            return self._latest_price
        return sum(prices) / len(prices)

    def volatility(self, seconds: int = 60) -> float:
        """Standard deviation of price over last N seconds (as %)."""
        if not self._price_history:
            return 0.0
        now = time.time()
        cutoff = now - seconds
        prices = [p for ts, p in self._price_history if ts >= cutoff]
        if len(prices) < 2:
            return 0.0
        mean = sum(prices) / len(prices)
        variance = sum((p - mean) ** 2 for p in prices) / len(prices)
        return (variance ** 0.5) / mean * 100  # as percentage

    async def start(self) -> None:
        """Start the WebSocket connection in background."""
        if self._running:
            return
        self._running = True
        self._task = asyncio.create_task(self._ws_loop())
        logger.info("Binance price feed starting...")

    async def stop(self) -> None:
        """Stop the WebSocket connection."""
        self._running = False
        self._connected = False
        if self._task and not self._task.done():
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        self._task = None
        logger.info("Binance price feed stopped")

    async def _ws_loop(self) -> None:
        """Main loop with auto-reconnect."""
        reconnect_count = 0
        while self._running:
            try:
                await self._connect()
                reconnect_count = 0  # reset on successful connection
            except asyncio.CancelledError:
                break
            except Exception as e:
                self._connected = False
                reconnect_count += 1
                if reconnect_count > MAX_RECONNECT:
                    logger.error(f"Binance WS: max reconnects ({MAX_RECONNECT}) exceeded, giving up")
                    break
                wait = RECONNECT_BACKOFF * (2 ** (reconnect_count - 1))
                logger.warning(f"Binance WS error: {e}, reconnecting in {wait:.1f}s ({reconnect_count}/{MAX_RECONNECT})")
                await asyncio.sleep(wait)

    async def _connect(self) -> None:
        """Connect to Binance and stream trades."""
        import websockets

        async with websockets.connect(BINANCE_WS_URL, ping_interval=20, ping_timeout=10) as ws:
            self._connected = True
            logger.info("Binance WS connected")

            async for raw in ws:
                if not self._running:
                    break
                try:
                    msg = json.loads(raw)
                    price = float(msg["p"])  # trade price
                    ts = time.time()
                    self._latest_price = price
                    self._latest_time = ts
                    self._price_history.append((ts, price))
                except (KeyError, ValueError, json.JSONDecodeError):
                    continue
