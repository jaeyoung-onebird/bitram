"""5-minute BTC Up/Down market auto-discovery via Gamma API."""
from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass
from datetime import datetime, timezone

import httpx

logger = logging.getLogger(__name__)

GAMMA_HOST = "https://gamma-api.polymarket.com"


@dataclass
class ActiveMarket:
    condition_id: str
    yes_token_id: str
    no_token_id: str
    question: str
    slug: str
    start_time: datetime
    end_time: datetime
    tick_size: str
    neg_risk: bool
    yes_price: float = 0.5
    no_price: float = 0.5

    @property
    def seconds_remaining(self) -> float:
        return max(0, (self.end_time - datetime.now(timezone.utc)).total_seconds())

    @property
    def duration_seconds(self) -> float:
        return (self.end_time - self.start_time).total_seconds()

    @property
    def is_active(self) -> bool:
        now = datetime.now(timezone.utc)
        return self.start_time <= now < self.end_time


def _parse_slug_timing(slug: str) -> tuple[int | None, int]:
    """Extract start timestamp and duration from slug.

    Pattern: btc-updown-5m-1773400800
    Returns (start_epoch, duration_seconds).
    """
    # Duration: -5m-, -15m-, -1h-
    dur_match = re.search(r"-(\d+)(m|h)-", slug.lower())
    duration_sec = 0
    if dur_match:
        val, unit = int(dur_match.group(1)), dur_match.group(2)
        duration_sec = val * 60 if unit == "m" else val * 3600

    # Unix timestamp (last numeric segment)
    ts_match = re.search(r"-(\d{10,})$", slug)
    start_epoch = int(ts_match.group(1)) if ts_match else None

    return start_epoch, duration_sec


def _parse_market(m: dict) -> ActiveMarket | None:
    """Parse a Gamma API market dict into ActiveMarket."""
    slug = m.get("slug", "")
    slug_lower = slug.lower()

    # Must be a 5-minute BTC updown market
    if "btc" not in slug_lower or "5m" not in slug_lower:
        return None

    if not m.get("active") or m.get("closed"):
        return None

    # Parse timing from slug
    start_epoch, duration_sec = _parse_slug_timing(slug)
    if start_epoch is None or duration_sec <= 0:
        return None

    start_time = datetime.fromtimestamp(start_epoch, tz=timezone.utc)
    end_time = datetime.fromtimestamp(start_epoch + duration_sec, tz=timezone.utc)

    # Parse token IDs
    tokens = m.get("clobTokenIds", [])
    if isinstance(tokens, str):
        try:
            tokens = json.loads(tokens)
        except Exception:
            return None
    if not tokens or len(tokens) < 2:
        return None

    # Parse prices
    prices = m.get("outcomePrices", [])
    if isinstance(prices, str):
        try:
            prices = json.loads(prices)
        except Exception:
            prices = ["0.5", "0.5"]

    yes_price = float(prices[0]) if prices else 0.5
    no_price = float(prices[1]) if len(prices) > 1 else 0.5

    return ActiveMarket(
        condition_id=m.get("conditionId", m.get("condition_id", "")),
        yes_token_id=tokens[0],
        no_token_id=tokens[1],
        question=m.get("question", ""),
        slug=slug,
        start_time=start_time,
        end_time=end_time,
        tick_size=m.get("minimumTickSize", "0.01"),
        neg_risk=bool(m.get("negRisk", False)),
        yes_price=yes_price,
        no_price=no_price,
    )


async def find_btc_5min_markets(
    *, http: httpx.AsyncClient | None = None,
) -> list[ActiveMarket]:
    """Find all active and upcoming BTC 5-minute markets.

    Returns markets sorted by start_time (earliest first).
    """
    close_after = False
    if http is None:
        http = httpx.AsyncClient(timeout=15.0)
        close_after = True

    markets: list[ActiveMarket] = []

    try:
        # Strategy 1: Search events by tag
        resp = await http.get(
            f"{GAMMA_HOST}/events",
            params={
                "active": "true",
                "closed": "false",
                "tag": "crypto",
                "limit": 50,
                "order": "startDate",
                "ascending": "false",
            },
        )
        resp.raise_for_status()
        events = resp.json()

        for ev in events:
            for m in ev.get("markets", []):
                parsed = _parse_market(m)
                if parsed:
                    markets.append(parsed)

        # Strategy 2: Direct market search if tag didn't find enough
        if len(markets) < 5:
            resp2 = await http.get(
                f"{GAMMA_HOST}/markets",
                params={
                    "active": "true",
                    "closed": "false",
                    "limit": 100,
                    "tag": "crypto",
                },
            )
            resp2.raise_for_status()
            extra = resp2.json()
            existing_ids = {m.condition_id for m in markets}
            for m in extra:
                parsed = _parse_market(m)
                if parsed and parsed.condition_id not in existing_ids:
                    markets.append(parsed)

        # Strategy 3: Public search for "btc updown 5m"
        if len(markets) < 5:
            resp3 = await http.get(
                f"{GAMMA_HOST}/public-search",
                params={"q": "btc updown 5m", "limit_per_type": 20},
            )
            resp3.raise_for_status()
            search_events = resp3.json().get("events", [])
            existing_ids = {m.condition_id for m in markets}
            for ev in search_events:
                for m in ev.get("markets", []):
                    parsed = _parse_market(m)
                    if parsed and parsed.condition_id not in existing_ids:
                        markets.append(parsed)

    except Exception as e:
        logger.error(f"Market finder error: {e}")
    finally:
        if close_after:
            await http.aclose()

    # Sort by start time (earliest first)
    markets.sort(key=lambda m: m.start_time)

    logger.info(f"Found {len(markets)} BTC 5-min markets")
    return markets


async def find_current_btc_5min_market(
    *, http: httpx.AsyncClient | None = None,
) -> ActiveMarket | None:
    """Find the currently active BTC 5-min market (if any)."""
    all_markets = await find_btc_5min_markets(http=http)
    now = datetime.now(timezone.utc)

    for m in all_markets:
        if m.start_time <= now < m.end_time:
            logger.info(
                f"Current market: {m.question} "
                f"({m.seconds_remaining:.0f}s remaining)"
            )
            return m

    return None


async def find_next_btc_5min_market(
    *, http: httpx.AsyncClient | None = None,
) -> ActiveMarket | None:
    """Find the next upcoming BTC 5-min market."""
    all_markets = await find_btc_5min_markets(http=http)
    now = datetime.now(timezone.utc)

    for m in all_markets:
        if m.start_time > now:
            wait_seconds = (m.start_time - now).total_seconds()
            logger.info(
                f"Next market: {m.question} "
                f"(starts in {wait_seconds:.0f}s)"
            )
            return m

    return None
