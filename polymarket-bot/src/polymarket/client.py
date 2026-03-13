"""ClobClient wrapper — auth, order management, dry-run support, retry logic."""
from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass
from typing import Any

from src.config import CredentialsConfig

logger = logging.getLogger(__name__)

CLOB_HOST = "https://clob.polymarket.com"
GAMMA_HOST = "https://gamma-api.polymarket.com"
MAX_RETRIES = 3
RETRY_BACKOFF = 1.0  # seconds, doubled each retry
RATE_LIMIT_DELAY = 0.05  # 20 req/sec


@dataclass
class OrderResult:
    order_id: str
    success: bool
    message: str = ""


class PolymarketClient:
    """Wraps py-clob-client with async support, retries, and dry-run mode."""

    def __init__(self, creds: CredentialsConfig, *, dry_run: bool = True) -> None:
        self.creds = creds
        self.dry_run = dry_run
        self._clob = None
        self._http = None
        self._last_request_time = 0.0

    def _get_clob(self):
        """Lazy-init ClobClient."""
        if self._clob is not None:
            return self._clob

        from py_clob_client.client import ClobClient
        from py_clob_client.clob_types import ApiCreds

        self._clob = ClobClient(
            CLOB_HOST,
            key=self.creds.private_key,
            chain_id=self.creds.chain_id,
            signature_type=self.creds.signature_type,
            funder=self.creds.safe_address or None,
        )

        if self.creds.api_key:
            api_creds = ApiCreds(
                api_key=self.creds.api_key,
                api_secret=self.creds.api_secret,
                api_passphrase=self.creds.api_passphrase,
            )
            self._clob.set_api_creds(api_creds)
        else:
            # Derive credentials from private key
            logger.info("No API creds in .env, deriving from private key...")
            derived = self._clob.create_or_derive_api_creds()
            self._clob.set_api_creds(derived)
            logger.info(f"Derived API key: {derived.api_key[:8]}...")

        return self._clob

    async def _get_http(self):
        if self._http is None:
            import httpx
            self._http = httpx.AsyncClient(timeout=15.0)
        return self._http

    async def _rate_limit(self) -> None:
        elapsed = time.time() - self._last_request_time
        if elapsed < RATE_LIMIT_DELAY:
            await asyncio.sleep(RATE_LIMIT_DELAY - elapsed)
        self._last_request_time = time.time()

    async def _retry(self, fn, *args, **kwargs) -> Any:
        """Execute with exponential backoff retry."""
        last_error = None
        for attempt in range(MAX_RETRIES):
            try:
                await self._rate_limit()
                return await asyncio.to_thread(fn, *args, **kwargs)
            except Exception as e:
                last_error = e
                wait = RETRY_BACKOFF * (2 ** attempt)
                logger.warning(f"Attempt {attempt + 1}/{MAX_RETRIES} failed: {e}, retrying in {wait:.1f}s")
                await asyncio.sleep(wait)
        raise last_error  # type: ignore[misc]

    async def close(self) -> None:
        if self._http:
            await self._http.aclose()
            self._http = None

    # ── Market Data (no auth) ──────────────────────────────────────────

    async def get_orderbook(self, token_id: str) -> dict:
        """Fetch orderbook for a token."""
        clob = self._get_clob()
        return await self._retry(clob.get_order_book, token_id)

    async def get_midpoint(self, token_id: str) -> float:
        """Get midpoint price."""
        await self._rate_limit()
        http = await self._get_http()
        resp = await http.get(f"{CLOB_HOST}/midpoint", params={"token_id": token_id})
        resp.raise_for_status()
        return float(resp.json().get("mid", 0))

    async def get_price(self, token_id: str, side: str = "buy") -> float:
        """Get best price for a side."""
        await self._rate_limit()
        http = await self._get_http()
        resp = await http.get(f"{CLOB_HOST}/price", params={"token_id": token_id, "side": side})
        resp.raise_for_status()
        return float(resp.json().get("price", 0))

    # ── Trading (auth required) ────────────────────────────────────────

    async def create_limit_order(
        self,
        token_id: str,
        side: str,
        price: float,
        size: float,
        tick_size: str = "0.01",
        neg_risk: bool = False,
    ) -> OrderResult:
        """Create and post a GTC limit (maker) order."""
        if self.dry_run:
            logger.info(
                f"[DRY RUN] LIMIT {side.upper()} {size} shares @ ${price:.4f} "
                f"token={token_id[:16]}..."
            )
            return OrderResult(order_id="dry_run", success=True, message="dry run")

        clob = self._get_clob()
        from py_clob_client.order_builder.constants import BUY, SELL

        order_side = BUY if side.upper() == "BUY" else SELL

        try:
            signed = await self._retry(
                clob.create_order,
                {
                    "token_id": token_id,
                    "price": price,
                    "size": size,
                    "side": order_side,
                },
                "GTC",
                tick_size,
                neg_risk,
            )
            result = await self._retry(clob.post_order, signed, "GTC")
            order_id = result.get("orderID", result.get("id", ""))
            logger.info(f"LIMIT {side.upper()} posted: id={order_id}, {size}@{price:.4f}")
            return OrderResult(order_id=order_id, success=True)
        except Exception as e:
            logger.error(f"Limit order failed: {e}")
            return OrderResult(order_id="", success=False, message=str(e))

    async def cancel_order(self, order_id: str) -> bool:
        """Cancel a single order."""
        if self.dry_run:
            logger.info(f"[DRY RUN] CANCEL order {order_id}")
            return True

        clob = self._get_clob()
        try:
            await self._retry(clob.cancel, order_id)
            logger.info(f"Cancelled order {order_id}")
            return True
        except Exception as e:
            logger.error(f"Cancel failed for {order_id}: {e}")
            return False

    async def cancel_all(self) -> bool:
        """Cancel all open orders."""
        if self.dry_run:
            logger.info("[DRY RUN] CANCEL ALL orders")
            return True

        clob = self._get_clob()
        try:
            await self._retry(clob.cancel_all)
            logger.info("Cancelled all orders")
            return True
        except Exception as e:
            logger.error(f"Cancel all failed: {e}")
            return False

    async def cancel_market_orders(self, condition_id: str) -> bool:
        """Cancel all orders for a specific market."""
        if self.dry_run:
            logger.info(f"[DRY RUN] CANCEL market orders for {condition_id[:16]}...")
            return True

        clob = self._get_clob()
        try:
            await self._retry(clob.cancel_market_orders, condition_id)
            logger.info(f"Cancelled market orders for {condition_id[:16]}...")
            return True
        except Exception as e:
            logger.error(f"Cancel market orders failed: {e}")
            return False

    async def get_open_orders(self) -> list[dict]:
        """Get all open orders."""
        clob = self._get_clob()
        result = await self._retry(clob.get_orders)
        return result if isinstance(result, list) else []

    # ── Verification ───────────────────────────────────────────────────

    async def verify_connection(self) -> bool:
        """Check CLOB API connectivity."""
        try:
            clob = self._get_clob()
            result = await self._retry(clob.get_ok)
            return result == "OK"
        except Exception as e:
            logger.error(f"Connection check failed: {e}")
            return False
