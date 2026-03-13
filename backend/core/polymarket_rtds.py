"""
Polymarket RTDS (Real-Time Data Socket) — live crypto prices
Connects to wss://ws-live-data.polymarket.com for Binance-sourced crypto prices.
Used by the AI trader instead of HTTP polling Binance directly.
"""
import asyncio
import json
import logging
import time
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

RTDS_URL = "wss://ws-live-data.polymarket.com"

# Shared state — updated by WebSocket, read by AI trader
_crypto_prices: dict[str, float] = {}
_last_update: float = 0
_ws_task: asyncio.Task | None = None
_running = False


def get_live_crypto_prices() -> dict[str, float]:
    """Get latest crypto prices from RTDS cache.
    Returns {"BTC": 72500.12, "ETH": 3800.50, ...} or empty if WS not connected.
    """
    return dict(_crypto_prices)


def get_price_age_seconds() -> float:
    """How many seconds since last price update."""
    if _last_update == 0:
        return float("inf")
    return time.time() - _last_update


async def start_rtds():
    """Start the RTDS WebSocket connection in the background."""
    global _ws_task, _running
    if _running:
        return
    _running = True
    _ws_task = asyncio.create_task(_rtds_loop())
    logger.info("RTDS WebSocket started")


async def stop_rtds():
    """Stop the RTDS WebSocket."""
    global _running, _ws_task
    _running = False
    if _ws_task and not _ws_task.done():
        _ws_task.cancel()
        try:
            await _ws_task
        except asyncio.CancelledError:
            pass
    _ws_task = None
    logger.info("RTDS WebSocket stopped")


async def _rtds_loop():
    """Main WebSocket loop with auto-reconnect."""
    global _running

    while _running:
        try:
            await _connect_and_listen()
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.warning(f"RTDS connection error: {e}, reconnecting in 5s...")
            await asyncio.sleep(5)


async def _connect_and_listen():
    """Connect to RTDS and listen for crypto price updates."""
    global _crypto_prices, _last_update

    try:
        import websockets
    except ImportError:
        logger.warning("websockets not installed, RTDS disabled. Install with: pip install websockets")
        # Fallback: just stop trying
        global _running
        _running = False
        return

    async with websockets.connect(RTDS_URL, ping_interval=5, ping_timeout=10) as ws:
        # Subscribe to crypto_prices topic
        subscribe_msg = json.dumps({
            "action": "subscribe",
            "subscriptions": [
                {"topic": "crypto_prices", "type": "update"},
            ],
        })
        await ws.send(subscribe_msg)
        logger.info("RTDS: subscribed to crypto_prices")

        msg_count = 0
        async for raw_msg in ws:
            if not _running:
                break

            if raw_msg == "PONG":
                continue

            try:
                msg = json.loads(raw_msg)
            except json.JSONDecodeError:
                continue

            msg_count += 1
            if msg_count <= 5:
                logger.info(f"RTDS msg #{msg_count}: {str(raw_msg)[:300]}")

            # Parse crypto price updates
            # Actual format: {"topic":"crypto_prices","type":"update",
            #   "payload":{"symbol":"btcusdt","value":72349.32,"full_accuracy_value":"72349.32000000"}}
            topic = msg.get("topic", "")
            payload = msg.get("payload", {})

            if topic == "crypto_prices" and isinstance(payload, dict):
                symbol = payload.get("symbol", "")
                value = payload.get("value")

                symbol_map = {
                    "btcusdt": "BTC",
                    "ethusdt": "ETH",
                    "solusdt": "SOL",
                    "xrpusdt": "XRP",
                }

                coin = symbol_map.get(symbol)
                if coin and value is not None:
                    try:
                        _crypto_prices[coin] = float(value)
                        _last_update = time.time()
                    except (ValueError, TypeError):
                        pass

                if msg_count <= 5:
                    logger.info(f"RTDS prices: {_crypto_prices}")
