"""
BITRAM Polymarket CLOB API Client
Wraps py-clob-client SDK with async support.
"""
import asyncio
import json
import logging
import time
from typing import Optional

from config import get_settings

logger = logging.getLogger(__name__)

CLOB_HOST = "https://clob.polymarket.com"
GAMMA_HOST = "https://gamma-api.polymarket.com"
RELAYER_HOST = "https://relayer-v2.polymarket.com"
RATE_LIMIT_DELAY = 0.05  # 20 req/sec (well under 9000/10s limit)


class PolymarketClient:
    def __init__(
        self,
        private_key: str = "",
        api_key: str = "",
        api_secret: str = "",
        api_passphrase: str = "",
        chain_id: int = 137,
    ):
        self.private_key = private_key
        self.api_key = api_key
        self.api_secret = api_secret
        self.api_passphrase = api_passphrase
        self.chain_id = chain_id
        self._last_request_time = 0.0
        self._clob_client = None
        self._http = None

    def _get_clob_client(self):
        """Lazy-init py-clob-client ClobClient."""
        if self._clob_client is None:
            try:
                from py_clob_client.client import ClobClient
                from py_clob_client.clob_types import ApiCreds

                if self.private_key:
                    self._clob_client = ClobClient(
                        CLOB_HOST,
                        key=self.private_key,
                        chain_id=self.chain_id,
                    )
                    if self.api_key:
                        creds = ApiCreds(
                            api_key=self.api_key,
                            api_secret=self.api_secret,
                            api_passphrase=self.api_passphrase,
                        )
                        self._clob_client.set_api_creds(creds)
                else:
                    # Read-only client
                    self._clob_client = ClobClient(CLOB_HOST)
            except ImportError:
                logger.warning("py-clob-client not installed, using HTTP fallback")
        return self._clob_client

    async def _get_http(self):
        if self._http is None:
            import httpx
            self._http = httpx.AsyncClient(timeout=15.0)
        return self._http

    async def _rate_limit(self):
        elapsed = time.time() - self._last_request_time
        if elapsed < RATE_LIMIT_DELAY:
            await asyncio.sleep(RATE_LIMIT_DELAY - elapsed)
        self._last_request_time = time.time()

    async def close(self):
        if self._http:
            await self._http.aclose()
            self._http = None

    # ─── Market Data (Gamma API - no auth needed) ─────────────────────────

    async def get_markets(
        self,
        limit: int = 50,
        offset: int = 0,
        active: bool = True,
        closed: bool = False,
        tag: str = "",
    ) -> list[dict]:
        """Fetch markets from Gamma API."""
        await self._rate_limit()
        http = await self._get_http()
        params = {
            "limit": limit,
            "offset": offset,
            "active": str(active).lower(),
            "closed": str(closed).lower(),
            "order": "volume24hr",
            "ascending": "false",
        }
        if tag:
            params["tag"] = tag
        resp = await http.get(f"{GAMMA_HOST}/markets", params=params)
        resp.raise_for_status()
        return resp.json()

    async def get_events(
        self,
        limit: int = 20,
        active: bool = True,
        closed: bool = False,
        tag: str = "",
    ) -> list[dict]:
        """Fetch events from Gamma API (events contain grouped markets)."""
        await self._rate_limit()
        http = await self._get_http()
        params = {
            "limit": limit,
            "active": str(active).lower(),
            "closed": str(closed).lower(),
            "order": "startDate",
            "ascending": "false",
        }
        if tag:
            params["tag"] = tag
        resp = await http.get(f"{GAMMA_HOST}/events", params=params)
        resp.raise_for_status()
        return resp.json()

    async def search_markets(self, query: str, limit: int = 20) -> list[dict]:
        """Search markets by query string."""
        await self._rate_limit()
        http = await self._get_http()
        params = {"_q": query, "limit": limit, "active": "true"}
        resp = await http.get(f"{GAMMA_HOST}/markets", params=params)
        resp.raise_for_status()
        return resp.json()

    async def public_search(self, query: str, limit: int = 20, tag: str = "") -> dict:
        """Search via Gamma public search API (finds short-term markets better)."""
        await self._rate_limit()
        http = await self._get_http()
        params = {"q": query, "limit_per_type": limit}
        if tag:
            params["events_tag"] = tag
        resp = await http.get(f"{GAMMA_HOST}/public-search", params=params)
        resp.raise_for_status()
        return resp.json()

    async def get_market(self, condition_id: str) -> Optional[dict]:
        """Get single market by condition_id."""
        await self._rate_limit()
        http = await self._get_http()
        resp = await http.get(f"{GAMMA_HOST}/markets/{condition_id}")
        if resp.status_code == 404:
            return None
        resp.raise_for_status()
        return resp.json()

    # ─── CLOB Data (orderbook, prices) ────────────────────────────────────

    async def get_order_book(self, token_id: str) -> dict:
        """Get orderbook for a token."""
        client = self._get_clob_client()
        if client:
            await self._rate_limit()
            return await asyncio.to_thread(client.get_order_book, token_id)
        # HTTP fallback
        await self._rate_limit()
        http = await self._get_http()
        resp = await http.get(f"{CLOB_HOST}/book", params={"token_id": token_id})
        resp.raise_for_status()
        return resp.json()

    async def get_midpoint(self, token_id: str) -> float:
        """Get midpoint price for a token."""
        await self._rate_limit()
        http = await self._get_http()
        resp = await http.get(f"{CLOB_HOST}/midpoint", params={"token_id": token_id})
        resp.raise_for_status()
        return float(resp.json().get("mid", 0))

    async def get_midpoints(self, token_ids: list[str]) -> dict[str, float]:
        """Batch fetch midpoint prices for multiple tokens."""
        if not token_ids:
            return {}
        await self._rate_limit()
        http = await self._get_http()
        resp = await http.get(
            f"{CLOB_HOST}/midpoints",
            params={"token_ids": ",".join(token_ids)},
        )
        resp.raise_for_status()
        data = resp.json()
        # Returns {token_id: mid_price_string, ...}
        return {k: float(v) for k, v in data.items() if v}

    async def get_price(self, token_id: str, side: str = "buy") -> float:
        """Get best price for a side."""
        client = self._get_clob_client()
        if client:
            await self._rate_limit()
            result = await asyncio.to_thread(client.get_price, token_id, side)
            return float(result)
        await self._rate_limit()
        http = await self._get_http()
        resp = await http.get(
            f"{CLOB_HOST}/price", params={"token_id": token_id, "side": side}
        )
        resp.raise_for_status()
        return float(resp.json().get("price", 0))

    # ─── Trading (requires auth) ──────────────────────────────────────────

    async def create_and_post_order(
        self,
        token_id: str,
        side: str,
        price: float,
        size: float,
        order_type: str = "GTC",
    ) -> dict:
        """Create and submit a limit order."""
        client = self._get_clob_client()
        if not client:
            raise RuntimeError("py-clob-client required for trading")

        from py_clob_client.order_builder.constants import BUY, SELL

        order_side = BUY if side.upper() == "BUY" else SELL

        await self._rate_limit()
        order = await asyncio.to_thread(
            client.create_order,
            {
                "token_id": token_id,
                "price": price,
                "size": size,
                "side": order_side,
            },
        )

        await self._rate_limit()
        result = await asyncio.to_thread(client.post_order, order, order_type)
        return result

    async def create_market_order(
        self, token_id: str, side: str, amount: float
    ) -> dict:
        """Create and submit a market order."""
        client = self._get_clob_client()
        if not client:
            raise RuntimeError("py-clob-client required for trading")

        from py_clob_client.order_builder.constants import BUY, SELL

        order_side = BUY if side.upper() == "BUY" else SELL

        await self._rate_limit()
        order = await asyncio.to_thread(
            client.create_market_order,
            {
                "token_id": token_id,
                "amount": amount,
                "side": order_side,
            },
        )

        await self._rate_limit()
        result = await asyncio.to_thread(client.post_order, order)
        return result

    async def cancel_order(self, order_id: str) -> dict:
        client = self._get_clob_client()
        if not client:
            raise RuntimeError("py-clob-client required")
        await self._rate_limit()
        return await asyncio.to_thread(client.cancel, order_id)

    async def cancel_all_orders(self) -> dict:
        client = self._get_clob_client()
        if not client:
            raise RuntimeError("py-clob-client required")
        await self._rate_limit()
        return await asyncio.to_thread(client.cancel_all)

    async def get_orders(self) -> list[dict]:
        client = self._get_clob_client()
        if not client:
            return []
        await self._rate_limit()
        result = await asyncio.to_thread(client.get_orders)
        return result if isinstance(result, list) else []

    async def get_trades_history(self) -> list[dict]:
        client = self._get_clob_client()
        if not client:
            return []
        await self._rate_limit()
        result = await asyncio.to_thread(client.get_trades)
        return result if isinstance(result, list) else []

    # ─── Relayer (gasless on-chain txns: redeem, split, merge) ────────────

    async def relayer_get_nonce(self, address: str, tx_type: str = "SAFE") -> dict:
        """Get relayer address and nonce for constructing transactions."""
        await self._rate_limit()
        http = await self._get_http()
        resp = await http.get(
            f"{RELAYER_HOST}/relay-payload",
            params={"address": address, "type": tx_type},
            headers=self._relayer_headers(),
        )
        resp.raise_for_status()
        return resp.json()

    async def relayer_get_transactions(self) -> list[dict]:
        """Get recent relayer transactions."""
        await self._rate_limit()
        http = await self._get_http()
        resp = await http.get(
            f"{RELAYER_HOST}/transactions",
            headers=self._relayer_headers(),
        )
        resp.raise_for_status()
        return resp.json()

    async def relayer_submit(self, payload: dict) -> dict:
        """Submit a signed transaction to the relayer."""
        await self._rate_limit()
        http = await self._get_http()
        resp = await http.post(
            f"{RELAYER_HOST}/submit",
            json=payload,
            headers=self._relayer_headers(),
        )
        resp.raise_for_status()
        return resp.json()

    def _relayer_headers(self) -> dict:
        """Build relayer auth headers."""
        settings = get_settings()
        headers = {}
        if settings.POLYMARKET_RELAYER_API_KEY:
            headers["RELAYER_API_KEY"] = settings.POLYMARKET_RELAYER_API_KEY
            headers["RELAYER_API_KEY_ADDRESS"] = settings.POLYMARKET_RELAYER_ADDRESS
        return headers

    # ─── Verification ─────────────────────────────────────────────────────

    async def verify_connection(self) -> bool:
        """Verify API connection works."""
        try:
            client = self._get_clob_client()
            if client:
                await self._rate_limit()
                result = await asyncio.to_thread(client.get_ok)
                return result == "OK"
            # HTTP fallback
            http = await self._get_http()
            resp = await http.get(f"{CLOB_HOST}/")
            return resp.status_code == 200
        except Exception as e:
            logger.error(f"Polymarket connection verification failed: {e}")
            return False


# ─── Factory ──────────────────────────────────────────────────────────────

_default_client: Optional[PolymarketClient] = None


def get_polymarket_client() -> PolymarketClient:
    """Get a Polymarket client configured from .env settings."""
    global _default_client
    if _default_client is None:
        settings = get_settings()
        _default_client = PolymarketClient(
            private_key=settings.POLYMARKET_PRIVATE_KEY,
            api_key=settings.POLYMARKET_API_KEY,
            api_secret=settings.POLYMARKET_API_SECRET,
            api_passphrase=settings.POLYMARKET_API_PASSPHRASE,
            chain_id=settings.POLYMARKET_CHAIN_ID,
        )
    return _default_client


def create_polymarket_client(
    private_key: str, api_key: str, api_secret: str, api_passphrase: str
) -> PolymarketClient:
    """Create a new Polymarket client with custom credentials."""
    settings = get_settings()
    return PolymarketClient(
        private_key=private_key,
        api_key=api_key,
        api_secret=api_secret,
        api_passphrase=api_passphrase,
        chain_id=settings.POLYMARKET_CHAIN_ID,
    )
