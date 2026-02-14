from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Query

from core.upbit_client import get_public_client

router = APIRouter(prefix="/api/market", tags=["market"])


@router.get("/quotes")
async def get_quotes(
    markets: Annotated[list[str] | None, Query(description="Upbit markets, e.g. KRW-BTC")] = None,
):
    """
    Lightweight public market quotes for dashboard UI.
    Uses Upbit public ticker API through the shared async client.
    """
    # Default: dashboard-friendly set (no fake data).
    if not markets:
        markets = [
            "KRW-BTC",
            "KRW-ETH",
            "KRW-XRP",
            "KRW-SOL",
            "KRW-DOGE",
            "KRW-ADA",
            "KRW-AVAX",
            "KRW-DOT",
        ]

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
    return {"quotes": out}

