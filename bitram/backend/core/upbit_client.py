"""
BITRAM Upbit API Client
Handles all Upbit exchange interactions with rate limiting.
"""
import time
import uuid
import hashlib
import jwt as pyjwt
import httpx
from urllib.parse import urlencode, unquote
from typing import Optional
import asyncio
import logging

logger = logging.getLogger(__name__)

UPBIT_API_URL = "https://api.upbit.com/v1"
UPBIT_WS_URL = "wss://api.upbit.com/websocket/v1"
RATE_LIMIT_DELAY = 0.11  # ~9 req/sec


class UpbitClient:
    def __init__(self, access_key: str = "", secret_key: str = ""):
        self.access_key = access_key
        self.secret_key = secret_key
        self._last_request_time = 0.0
        self._client = httpx.AsyncClient(timeout=10.0)

    async def close(self):
        await self._client.aclose()

    def _auth_header(self, query: dict = None) -> dict:
        payload = {
            "access_key": self.access_key,
            "nonce": str(uuid.uuid4()),
        }
        if query:
            query_string = unquote(urlencode(query, doseq=True)).encode()
            m = hashlib.sha512()
            m.update(query_string)
            payload["query_hash"] = m.hexdigest()
            payload["query_hash_alg"] = "SHA512"

        token = pyjwt.encode(payload, self.secret_key, algorithm="HS256")
        return {"Authorization": f"Bearer {token}"}

    async def _rate_limit(self):
        elapsed = time.time() - self._last_request_time
        if elapsed < RATE_LIMIT_DELAY:
            await asyncio.sleep(RATE_LIMIT_DELAY - elapsed)
        self._last_request_time = time.time()

    async def _get(self, path: str, params: dict = None, auth: bool = False) -> dict | list:
        await self._rate_limit()
        headers = self._auth_header(params) if auth else {}
        resp = await self._client.get(f"{UPBIT_API_URL}{path}", params=params, headers=headers)
        resp.raise_for_status()
        return resp.json()

    async def _post(self, path: str, data: dict, auth: bool = True) -> dict:
        await self._rate_limit()
        headers = self._auth_header(data) if auth else {}
        resp = await self._client.post(f"{UPBIT_API_URL}{path}", json=data, headers=headers)
        resp.raise_for_status()
        return resp.json()

    async def _delete(self, path: str, params: dict, auth: bool = True) -> dict:
        await self._rate_limit()
        headers = self._auth_header(params) if auth else {}
        resp = await self._client.delete(f"{UPBIT_API_URL}{path}", params=params, headers=headers)
        resp.raise_for_status()
        return resp.json()

    # ─── Public APIs ─────────────────────────────────────────────────────

    async def get_markets(self) -> list[dict]:
        return await self._get("/market/all", {"isDetails": "true"})

    async def get_ticker(self, markets: list[str]) -> list[dict]:
        return await self._get("/ticker", {"markets": ",".join(markets)})

    async def get_candles(self, market: str, timeframe: str = "minutes/15",
                          count: int = 200, to: str = None) -> list[dict]:
        params = {"market": market, "count": min(count, 200)}
        if to:
            params["to"] = to
        return await self._get(f"/candles/{timeframe}", params)

    async def get_orderbook(self, markets: list[str]) -> list[dict]:
        return await self._get("/orderbook", {"markets": ",".join(markets)})

    # ─── Private APIs ────────────────────────────────────────────────────

    async def get_accounts(self) -> list[dict]:
        return await self._get("/accounts", auth=True)

    async def get_balance(self) -> dict:
        """Get KRW balance and coin balances."""
        accounts = await self.get_accounts()
        krw = 0
        coins = []
        for acc in accounts:
            if acc["currency"] == "KRW":
                krw = float(acc["balance"])
            else:
                coins.append({
                    "currency": acc["currency"],
                    "balance": float(acc["balance"]),
                    "locked": float(acc["locked"]),
                    "avg_buy_price": float(acc["avg_buy_price"]),
                })
        return {"krw": krw, "coins": coins}

    async def order_buy_market(self, market: str, price: float) -> dict:
        """Market buy order (price = total KRW to spend)."""
        return await self._post("/orders", {
            "market": market,
            "side": "bid",
            "price": str(price),
            "ord_type": "price",
        })

    async def order_sell_market(self, market: str, volume: float) -> dict:
        """Market sell order."""
        return await self._post("/orders", {
            "market": market,
            "side": "ask",
            "volume": str(volume),
            "ord_type": "market",
        })

    async def order_buy_limit(self, market: str, price: float, volume: float) -> dict:
        """Limit buy order."""
        return await self._post("/orders", {
            "market": market,
            "side": "bid",
            "price": str(price),
            "volume": str(volume),
            "ord_type": "limit",
        })

    async def order_sell_limit(self, market: str, price: float, volume: float) -> dict:
        """Limit sell order."""
        return await self._post("/orders", {
            "market": market,
            "side": "ask",
            "price": str(price),
            "volume": str(volume),
            "ord_type": "limit",
        })

    async def cancel_order(self, uuid_str: str) -> dict:
        return await self._delete("/order", {"uuid": uuid_str})

    async def get_order(self, uuid_str: str) -> dict:
        return await self._get("/order", {"uuid": uuid_str}, auth=True)

    async def get_orders(self, market: str = None, state: str = "wait") -> list[dict]:
        params = {"state": state}
        if market:
            params["market"] = market
        return await self._get("/orders", params, auth=True)

    async def wait_order_done(self, order_uuid: str, timeout: float = 15.0) -> dict:
        """Poll until order is done/cancelled, return final order info with trades."""
        import time as _time
        deadline = _time.time() + timeout
        while _time.time() < deadline:
            order = await self.get_order(order_uuid)
            state = order.get("state", "")
            if state in ("done", "cancel"):
                return order
            await asyncio.sleep(0.5)
        # Timeout — return last state
        return await self.get_order(order_uuid)

    async def verify_keys(self) -> bool:
        """Verify API key validity by checking accounts."""
        try:
            await self.get_accounts()
            return True
        except Exception:
            return False

    # ─── OHLCV Helpers ───────────────────────────────────────────────────

    async def fetch_ohlcv(self, market: str, timeframe: str = "15m",
                          count: int = 200) -> list[dict]:
        """Fetch OHLCV candles in normalized format."""
        tf_map = {
            "1m": "minutes/1", "3m": "minutes/3", "5m": "minutes/5",
            "10m": "minutes/10", "15m": "minutes/15", "30m": "minutes/30",
            "1h": "minutes/60", "4h": "minutes/240",
            "1d": "days", "1w": "weeks", "1M": "months",
        }
        api_tf = tf_map.get(timeframe, "minutes/15")
        target = max(1, int(count))

        # Upbit candles API returns up to 200 items per request. If the caller asks
        # for more, page backwards using the `to` cursor.
        raw: list[dict] = []
        to: str | None = None
        while len(raw) < target:
            batch_size = min(200, target - len(raw))
            batch = await self.get_candles(market, api_tf, batch_size, to=to)
            if not batch:
                break
            raw.extend(batch)
            # The API returns newest -> oldest; the last element is the oldest and
            # is used as the cursor for the next page.
            to = batch[-1].get("candle_date_time_utc") or batch[-1].get("candle_date_time_kst")
            if len(batch) < batch_size:
                break

        # De-dup by candle timestamp (some `to` cursors can yield overlaps).
        seen: set[str] = set()
        deduped: list[dict] = []
        for c in raw:
            ts = c.get("candle_date_time_kst") or c.get("candle_date_time_utc") or ""
            if ts in seen:
                continue
            seen.add(ts)
            deduped.append(c)

        deduped = deduped[:target]

        return [{
            "time": c["candle_date_time_kst"],
            "open": float(c["opening_price"]),
            "high": float(c["high_price"]),
            "low": float(c["low_price"]),
            "close": float(c["trade_price"]),
            "volume": float(c["candle_acc_trade_volume"]),
        } for c in reversed(deduped)]


# ─── Public client (no auth needed) ─────────────────────────────────────────

_public_client: Optional[UpbitClient] = None


def get_public_client() -> UpbitClient:
    global _public_client
    if _public_client is None:
        _public_client = UpbitClient()
    return _public_client
