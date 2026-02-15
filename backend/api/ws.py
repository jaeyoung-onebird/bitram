"""
WebSocket API: real-time bot status, market data, DM messaging, and notifications
"""
import asyncio
import json
import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from core.bot_manager import get_active_bots
from core.upbit_client import get_public_client
from api.deps import decode_token

logger = logging.getLogger(__name__)
router = APIRouter(tags=["websocket"])

# Connected clients
_bot_clients: dict[str, list[WebSocket]] = {}  # bot_id -> [ws]
_market_clients: list[WebSocket] = []


# ─── DM Connection Manager ──────────────────────────────────────────────────

class ConnectionManager:
    """Manages WebSocket connections for DM messaging."""

    def __init__(self):
        self._connections: dict[str, list[WebSocket]] = {}  # user_id -> [ws]

    async def connect(self, user_id: str, websocket: WebSocket):
        await websocket.accept()
        if user_id not in self._connections:
            self._connections[user_id] = []
        self._connections[user_id].append(websocket)

    def disconnect(self, user_id: str, websocket: WebSocket):
        if user_id in self._connections:
            self._connections[user_id] = [
                ws for ws in self._connections[user_id] if ws != websocket
            ]
            if not self._connections[user_id]:
                del self._connections[user_id]

    async def send_to_user(self, user_id: str, data: dict):
        """Send message to all connections of a user."""
        connections = self._connections.get(user_id, [])
        for ws in connections[:]:
            try:
                await ws.send_json(data)
            except Exception:
                self.disconnect(user_id, ws)

    def is_online(self, user_id: str) -> bool:
        return user_id in self._connections and len(self._connections[user_id]) > 0


dm_manager = ConnectionManager()


# ─── Notification Connection Manager ──────────────────────────────────────

class NotificationManager:
    """Manages WebSocket connections for real-time notifications."""

    def __init__(self):
        self.connections: dict[str, list[WebSocket]] = {}  # user_id -> [ws]

    async def connect(self, user_id: str, websocket: WebSocket):
        await websocket.accept()
        if user_id not in self.connections:
            self.connections[user_id] = []
        self.connections[user_id].append(websocket)

    async def disconnect(self, user_id: str, websocket: WebSocket):
        if user_id in self.connections:
            self.connections[user_id] = [
                ws for ws in self.connections[user_id] if ws != websocket
            ]
            if not self.connections[user_id]:
                del self.connections[user_id]

    async def send_notification(self, user_id: str, notification: dict):
        """Send notification to all connections of a user."""
        if user_id in self.connections:
            dead = []
            for ws in self.connections[user_id]:
                try:
                    await ws.send_json(notification)
                except Exception:
                    dead.append(ws)
            for ws in dead:
                if ws in self.connections.get(user_id, []):
                    self.connections[user_id].remove(ws)
            if user_id in self.connections and not self.connections[user_id]:
                del self.connections[user_id]


notification_manager = NotificationManager()


async def send_realtime_notification(user_id: str, data: dict):
    """
    Helper function that other API endpoints can call to send
    a real-time notification to a connected user.
    """
    await notification_manager.send_notification(user_id, {
        "type": "notification",
        **data,
    })


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


# ─── DM WebSocket ──────────────────────────────────────────────────────────

@router.websocket("/ws/dm/{user_id}")
async def dm_websocket(websocket: WebSocket, user_id: str, token: str = Query(...)):
    """
    WebSocket for real-time DM messaging.
    Connect: ws://host/ws/dm/{user_id}?token=<access_token>
    """
    # Authenticate
    try:
        payload = decode_token(token)
        if payload.get("type") != "access" or payload.get("sub") != user_id:
            await websocket.close(code=4001)
            return
    except Exception:
        await websocket.close(code=4001)
        return

    await dm_manager.connect(user_id, websocket)

    try:
        while True:
            # Keep connection alive, receive messages from client
            data = await websocket.receive_text()
            msg = json.loads(data)

            if msg.get("type") == "ping":
                await websocket.send_json({"type": "pong"})
    except WebSocketDisconnect:
        dm_manager.disconnect(user_id, websocket)
    except Exception:
        dm_manager.disconnect(user_id, websocket)


# ─── Notification WebSocket ──────────────────────────────────────────────

@router.websocket("/ws/notifications/{user_id}")
async def ws_notifications(websocket: WebSocket, user_id: str, token: str = Query(None)):
    """
    WebSocket for real-time notifications.
    Connect: ws://host/ws/notifications/{user_id}?token=<access_token>
    Receives push notifications for likes, comments, follows, quest completions, etc.
    """
    # Authenticate
    if not token:
        await websocket.close(code=4001)
        return

    try:
        payload = decode_token(token)
        if payload.get("type") != "access" or payload.get("sub") != user_id:
            await websocket.close(code=4001)
            return
    except Exception:
        await websocket.close(code=4001)
        return

    await notification_manager.connect(user_id, websocket)
    logger.info(f"Notification WS connected: user={user_id}")

    try:
        while True:
            # Keep connection alive with ping/pong
            data = await websocket.receive_text()
            msg = json.loads(data)

            if msg.get("type") == "ping":
                await websocket.send_json({"type": "pong"})
    except WebSocketDisconnect:
        await notification_manager.disconnect(user_id, websocket)
        logger.info(f"Notification WS disconnected: user={user_id}")
    except Exception as e:
        await notification_manager.disconnect(user_id, websocket)
        logger.warning(f"Notification WS error for user={user_id}: {e}")
