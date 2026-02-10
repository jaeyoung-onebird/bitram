"""
WebSocket API: real-time bot status and market data
"""
import asyncio
import json
import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from core.bot_manager import get_active_bots
from core.upbit_client import get_public_client

logger = logging.getLogger(__name__)
router = APIRouter(tags=["websocket"])

# Connected clients
_bot_clients: dict[str, list[WebSocket]] = {}  # bot_id -> [ws]
_market_clients: list[WebSocket] = []


@router.websocket("/ws/bot/{bot_id}")
async def bot_websocket(websocket: WebSocket, bot_id: str):
    await websocket.accept()

    if bot_id not in _bot_clients:
        _bot_clients[bot_id] = []
    _bot_clients[bot_id].append(websocket)

    try:
        while True:
            # Send bot status every 5 seconds
            active = get_active_bots()
            is_running = active.get(bot_id, False)
            await websocket.send_json({
                "type": "status_update",
                "bot_id": bot_id,
                "is_running": is_running,
            })
            await asyncio.sleep(5)
    except WebSocketDisconnect:
        _bot_clients[bot_id].remove(websocket)
    except Exception:
        _bot_clients.get(bot_id, []).remove(websocket) if websocket in _bot_clients.get(bot_id, []) else None


@router.websocket("/ws/market")
async def market_websocket(websocket: WebSocket):
    await websocket.accept()
    _market_clients.append(websocket)

    try:
        # Wait for client to send which markets to subscribe
        data = await websocket.receive_text()
        markets = json.loads(data).get("markets", ["KRW-BTC", "KRW-ETH", "KRW-XRP"])

        client = get_public_client()
        while True:
            try:
                tickers = await client.get_ticker(markets)
                await websocket.send_json({
                    "type": "price_update",
                    "data": [
                        {
                            "market": t["market"],
                            "price": float(t["trade_price"]),
                            "change": t["change"],
                            "change_rate": float(t["signed_change_rate"]) * 100,
                            "volume": float(t["acc_trade_volume_24h"]),
                        }
                        for t in tickers
                    ],
                })
            except Exception as e:
                logger.error(f"Market WS error: {e}")

            await asyncio.sleep(3)
    except WebSocketDisconnect:
        _market_clients.remove(websocket) if websocket in _market_clients else None


async def broadcast_trade(bot_id: str, trade_data: dict):
    """Broadcast trade execution to connected clients."""
    clients = _bot_clients.get(bot_id, [])
    for ws in clients[:]:
        try:
            await ws.send_json({"type": "trade_executed", **trade_data})
        except Exception:
            clients.remove(ws)
