"""Full-market scanner — discover tradeable markets across all categories."""
from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from datetime import datetime, timezone

import httpx

from src.scanner.category_filter import categorize_market

logger = logging.getLogger(__name__)

GAMMA_HOST = "https://gamma-api.polymarket.com"

# Default filters (can be overridden from config.yaml)
DEFAULT_FILTERS = {
    "min_liquidity": 5000,
    "min_volume_24h": 1000,
    "max_spread": 0.10,
    "min_hours_to_expiry": 2,
    "max_days_to_expiry": 30,
    "min_yes_price": 0.10,
    "max_yes_price": 0.90,
    "priority_categories": ["politics", "sports", "crypto", "macro"],
    "exclude_categories": [],
    "max_markets_per_scan": 50,
}


@dataclass
class MarketCandidate:
    condition_id: str
    question: str
    description: str
    category: str
    yes_token_id: str
    no_token_id: str
    yes_price: float
    no_price: float
    spread: float
    volume_24h: float
    liquidity: float
    end_date: datetime
    end_date_str: str
    tick_size: str
    neg_risk: bool
    slug: str = ""

    @property
    def hours_to_expiry(self) -> float:
        return max(0, (self.end_date - datetime.now(timezone.utc)).total_seconds() / 3600)

    @property
    def market_implied_probability(self) -> float:
        return self.yes_price


async def scan_all_markets(
    filters: dict | None = None,
    *,
    http: httpx.AsyncClient | None = None,
) -> list[MarketCandidate]:
    """Scan all active Polymarket markets and filter for trading candidates.

    Returns candidates sorted by priority category then volume.
    """
    f = {**DEFAULT_FILTERS, **(filters or {})}
    close_after = False
    if http is None:
        http = httpx.AsyncClient(timeout=20.0)
        close_after = True

    raw_markets: list[dict] = []

    try:
        # Fetch events (contains grouped markets)
        for offset in range(0, 200, 50):
            resp = await http.get(
                f"{GAMMA_HOST}/events",
                params={
                    "active": "true",
                    "closed": "false",
                    "limit": 50,
                    "offset": offset,
                    "order": "volume24hr",
                    "ascending": "false",
                },
            )
            resp.raise_for_status()
            events = resp.json()
            if not events:
                break

            for ev in events:
                for m in ev.get("markets", []):
                    if m.get("active") and not m.get("closed"):
                        raw_markets.append(m)

        logger.info(f"Scanner: fetched {len(raw_markets)} active markets")

    except Exception as e:
        logger.error(f"Scanner: fetch error: {e}")
    finally:
        if close_after:
            await http.aclose()

    # Parse and filter
    now = datetime.now(timezone.utc)
    candidates: list[MarketCandidate] = []

    for m in raw_markets:
        try:
            candidate = _parse_and_filter(m, f, now)
            if candidate:
                candidates.append(candidate)
        except Exception as e:
            logger.debug(f"Scanner: parse error for {m.get('conditionId', '?')}: {e}")

    # Sort by priority category then volume
    cat_priority = {cat: i for i, cat in enumerate(f["priority_categories"])}
    candidates.sort(
        key=lambda c: (cat_priority.get(c.category, 99), -c.volume_24h),
    )

    # Limit results
    max_markets = f.get("max_markets_per_scan", 50)
    candidates = candidates[:max_markets]

    logger.info(
        f"Scanner: {len(candidates)} candidates after filters "
        f"(from {len(raw_markets)} raw markets)"
    )
    return candidates


async def scan_by_category(
    category: str,
    filters: dict | None = None,
    *,
    http: httpx.AsyncClient | None = None,
) -> list[MarketCandidate]:
    """Scan only a specific category."""
    all_candidates = await scan_all_markets(filters, http=http)
    return [c for c in all_candidates if c.category == category]


def _parse_and_filter(
    m: dict,
    f: dict,
    now: datetime,
) -> MarketCandidate | None:
    """Parse a raw market dict and apply filters. Returns None if filtered out."""
    # Parse prices
    prices = m.get("outcomePrices", [])
    if isinstance(prices, str):
        prices = json.loads(prices)
    if not prices or len(prices) < 2:
        return None

    yes_price = float(prices[0])
    no_price = float(prices[1])

    # Price filter (exclude extreme probabilities)
    if yes_price < f["min_yes_price"] or yes_price > f["max_yes_price"]:
        return None

    # Spread filter
    spread = abs(yes_price - (1 - no_price))
    if spread > f["max_spread"]:
        return None

    # Volume filter
    volume = float(m.get("volume24hr", 0) or m.get("volume", 0) or 0)
    if volume < f["min_volume_24h"]:
        return None

    # Liquidity filter
    liquidity = float(m.get("liquidityNum", 0) or 0)
    if liquidity < f["min_liquidity"]:
        return None

    # Expiry filter
    end_date_str = m.get("endDate", "")
    if not end_date_str:
        return None
    try:
        end_date = datetime.fromisoformat(end_date_str.replace("Z", "+00:00"))
    except Exception:
        return None

    hours_left = (end_date - now).total_seconds() / 3600
    if hours_left < f["min_hours_to_expiry"]:
        return None
    if hours_left > f["max_days_to_expiry"] * 24:
        return None

    # Token IDs
    tokens = m.get("clobTokenIds", [])
    if isinstance(tokens, str):
        tokens = json.loads(tokens)
    if not tokens or len(tokens) < 2:
        return None

    # Categorize
    question = m.get("question", "")
    description = m.get("description", "")
    category = categorize_market(question, description)

    # Category filter
    if category in f.get("exclude_categories", []):
        return None

    return MarketCandidate(
        condition_id=m.get("conditionId", m.get("condition_id", "")),
        question=question,
        description=description[:500],
        category=category,
        yes_token_id=tokens[0],
        no_token_id=tokens[1],
        yes_price=yes_price,
        no_price=no_price,
        spread=round(spread, 4),
        volume_24h=round(volume),
        liquidity=round(liquidity),
        end_date=end_date,
        end_date_str=end_date_str,
        tick_size=m.get("minimumTickSize", "0.01"),
        neg_risk=bool(m.get("negRisk", False)),
        slug=m.get("slug", ""),
    )
