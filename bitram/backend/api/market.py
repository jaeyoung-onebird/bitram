from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Query

from core.upbit_client import get_public_client
from core.redis_cache import cache_get, cache_set

router = APIRouter(prefix="/api/market", tags=["market"])

DEFAULT_MARKETS = [
    "KRW-BTC", "KRW-ETH", "KRW-XRP", "KRW-SOL",
    "KRW-DOGE", "KRW-ADA", "KRW-AVAX", "KRW-DOT",
]

@router.get("/quotes")
async def get_quotes(
    markets: Annotated[list[str] | None, Query(description="Upbit markets, e.g. KRW-BTC")] = None,
):
    """
    Lightweight public market quotes for dashboard UI.
    Uses Upbit public ticker API through the shared async client.
    """
    if not markets:
        markets = DEFAULT_MARKETS

    cache_key = f"market:quotes:{','.join(sorted(markets))}"
    cached = await cache_get(cache_key)
    if cached is not None:
        return cached

    client = get_public_client()
    tickers = await client.get_ticker(markets)

    # Normalize fields so frontend doesn't depend on raw Upbit schema.
    out = []
    for t in tickers:
        out.append(
            {
                "market": t.get("market"),
                "symbol": str(t.get("market", "")).replace("KRW-", ""),
                "trade_price": float(t.get("trade_price", 0.0) or 0.0),
                "signed_change_rate_pct": float(t.get("signed_change_rate", 0.0) or 0.0) * 100.0,
                "change": t.get("change"),
                "acc_trade_volume_24h": float(t.get("acc_trade_volume_24h", 0.0) or 0.0),
                "timestamp": t.get("timestamp"),
            }
        )
    result = {"quotes": out}
    await cache_set(cache_key, result, ttl=10)  # 10초 캐시 (실시간 시세)
    return result

