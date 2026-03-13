"""
BITRAM Polymarket AI Trader
Uses Claude API to autonomously analyze markets and make trading decisions.
"""
import json
import logging
import re
from datetime import datetime, timezone

from config import get_settings
from core.polymarket_client import PolymarketClient

logger = logging.getLogger(__name__)

def calc_polymarket_fee(price: float, fee_rate: float = 0.25, exponent: int = 2) -> float:
    """Calculate Polymarket crypto market taker fee.
    Formula: fee = C * p * feeRate * (p * (1 - p))^exponent
    C = number of shares, p = price (0-1), feeRate = 0.25 for crypto
    Returns fee as fraction of trade value (multiply by C*p to get USDC).
    Max ~1.56% at p=0.50.
    """
    if price <= 0 or price >= 1:
        return 0
    return fee_rate * (price * (1 - price)) ** exponent


SYSTEM_PROMPT = """You are an elite AI prediction market trader on Polymarket. You trade crypto prediction markets with SURGICAL PRECISION.

## YOUR TRACK RECORD GOAL: 100% WIN RATE
You are NOT a random gambler. You only trade when you have a CLEAR EDGE. No edge = no trade.
The best traders make few trades but win almost all of them.

## Market Types You Trade

### Type 1: 5-min Up/Down Rounds
- "Price to beat" = reference price at round start
- If crypto ends ABOVE reference → "Up" wins ($1/share), "Down" → $0
- Token prices $0.00–$1.00 = market's probability estimate
- Slug pattern: btc-updown-5m-XXXXXXXXXX

### Type 2: Daily Crypto Price Markets
- "Will Bitcoin be above $72,000 on March 13?" — Yes pays $1 if true
- "Will Bitcoin be between $70,000-$72,000?" — Yes pays $1 if price in range
- These settle at a specific time (usually 16:00 UTC = 12:00 ET)
- Slug pattern: bitcoin-above-on-march-13, bitcoin-price-on-march-13

## Your Edge: Real-time Price Analysis
You receive LIVE Binance/RTDS prices. The market prices update slower than reality.
- For Up/Down: If BTC pumping but Up token still $0.50 → BUY Up
- For daily: If BTC at $72,500 but "above $72,000" is only $0.66 → likely undervalued
- For daily range: If BTC at $72,500, "between $72,000-$74,000" at $0.60 → analyze momentum
- If prices are flat/choppy → SKIP (no clear edge)

## STRICT Rules
1. **ONLY trade when confident >70%**. Skip everything else.
2. **Prefer 1-3 high-conviction trades** over many mediocre ones
3. **Time matters**: More time = more uncertainty. Near settlement with clear direction = strong edge.
4. **Spread check**: If Yes ≥ 0.95 or Yes ≤ 0.05, market already decided — SKIP
5. **BTC first**: BTC markets have most liquidity and clearest trends.
6. **Take profit at 30-50% ROI**. Don't hold to expiry if you're already winning.
7. **Cut losses at -30%** to preserve capital for better opportunities.
8. **For daily markets**: Look for mispriced outcomes. If BTC is $72,400 and "above $72,000" is $0.66, that looks cheap if BTC is trending up. But if BTC could easily drop $500 before settlement, it may be fairly priced.

## Key Metrics
- **up_price / down_price / yes_price / no_price**: Market probability ($0-$1)
- **current_crypto_prices**: REAL-TIME Binance prices — your primary signal
- **time_remaining_min**: Minutes left until settlement
- **spread**: |yes - no|. Near 0 = uncertain. >0.9 = mostly decided.
- **market_type**: "5m_updown" or "daily_price" — affects your strategy

Respond ONLY with valid JSON. No explanation, no markdown."""

BUY_PROMPT = """Analyze these {count} active crypto prediction markets. Decide which to BUY — but ONLY if you have a clear edge.

Budget: ${budget:.2f} | ${position_size:.2f}/position | max {max_new} new positions
Time: {now} | Mode: {mode}

## LIVE Crypto Prices (Binance/RTDS - real-time)
{crypto_prices_json}

## Available Markets
{markets_json}

## Current Positions (do NOT duplicate)
{positions_json}

## Your Task
1. Look at each market's question and type (5m_updown vs daily_price)
2. Check the LIVE crypto price — where is it NOW relative to the market's threshold?
3. For **5m_updown**: Is the coin trending up/down? Buy the side the market undervalues.
4. For **daily_price** ("above $X" / "between $X-$Y"): Compare live price to threshold.
   - If BTC=$72,500 and "above $72,000" Yes=$0.66, that's potentially cheap (should be higher if BTC stays above)
   - But consider: how much time until settlement? Can BTC drop $500+ in that time?
   - Key: markets near the threshold (within 1-3%) are most tradeable — clear direction = edge
5. If prices match reality or you're unsure → SKIP.

## Quality Over Quantity
- Only buy if confidence >= 0.70
- Prefer 1-2 high-conviction trades over 5 mediocre ones
- BTC markets are most liquid — prioritize them
- Skip if Yes ≥ 0.95 or Yes ≤ 0.05 (market already decided, no edge)
- For daily markets: best opportunities are where price is clearly on one side of threshold with momentum
- Use outcome "Yes" or "No" (or "Up"/"Down" for updown markets)

Respond with JSON:
{{
  "decisions": [
    {{
      "action": "buy",
      "condition_id": "...",
      "outcome": "Yes" or "No" or "Up" or "Down",
      "confidence": 0.70 to 1.0,
      "reason": "BTC at $72,500 trending up, 'above $72k' Yes at $0.66 is undervalued"
    }}
  ]
}}

Return empty decisions [] if nothing has a clear edge. Patience wins."""

EXIT_PROMPT = """Review open positions. Decide which to SELL to lock profit or cut losses.

Time: {now}

## LIVE Crypto Prices (Binance)
{crypto_prices_json}

## Open Positions
{positions_json}

## Sell Rules (STRICT)
1. **ROI >= +30%** → SELL to lock profit. Don't be greedy.
2. **ROI <= -30%** → SELL to cut loss. Preserve capital.
3. **Price >= $0.85** → Almost won. SELL for guaranteed ~70%+ profit, or hold if <0.5 min left.
4. **Price <= $0.15** → Almost lost. SELL to recover something.
5. **<1 min left + profitable** → SELL. Don't gamble on final seconds.
6. **<1 min left + losing** → SELL to recycle capital into next round.
7. After selling, capital is freed for the NEXT round. Selling is NOT losing — it's recycling.

Respond with JSON:
{{
  "decisions": [
    {{
      "action": "sell",
      "token_id": "...",
      "reason": "ROI +45%, locking profit"
    }}
  ]
}}

Empty [] = hold all positions."""


# ─── Real-time crypto price fetcher ───────────────────────────────────────

# Slug prefix → Binance symbol mapping
_SLUG_TO_SYMBOL = {
    "btc": "BTCUSDT",
    "eth": "ETHUSDT",
    "sol": "SOLUSDT",
    "xrp": "XRPUSDT",
}


async def _fetch_crypto_prices() -> dict[str, float]:
    """Fetch real-time crypto prices. Uses RTDS WebSocket cache first, Binance HTTP as fallback.
    Returns {"BTC": 70500.12, "ETH": 3800.50, ...}
    """
    # Try RTDS cache first (sub-second latency)
    try:
        from core.polymarket_rtds import get_live_crypto_prices, get_price_age_seconds
        prices = get_live_crypto_prices()
        age = get_price_age_seconds()
        if prices and age < 30:  # Use if fresh (< 30 seconds old)
            logger.debug(f"AI Trader: using RTDS prices (age={age:.1f}s)")
            return prices
    except ImportError:
        pass

    # Fallback: Binance HTTP API
    target_symbols = set(_SLUG_TO_SYMBOL.values())
    try:
        import httpx
        async with httpx.AsyncClient(timeout=5.0) as http:
            resp = await http.get("https://api.binance.com/api/v3/ticker/price")
            resp.raise_for_status()
            data = resp.json()
            prices = {}
            for item in data:
                if item["symbol"] in target_symbols:
                    coin = item["symbol"].replace("USDT", "")
                    prices[coin] = float(item["price"])
            return prices
    except Exception as e:
        logger.warning(f"Failed to fetch crypto prices from Binance: {e}")
        return {}


def _extract_coin_from_slug(slug: str) -> str | None:
    """Extract coin symbol from market slug. e.g. 'btc-updown-5m-xxx' → 'BTC'"""
    slug_lower = slug.lower()
    for prefix in _SLUG_TO_SYMBOL:
        if slug_lower.startswith(prefix + "-"):
            return prefix.upper()
    return None


# Category keywords → Gamma API tag mapping
_KEYWORD_TO_TAG = {
    "bitcoin": "crypto", "btc": "crypto", "eth": "crypto", "ethereum": "crypto",
    "crypto": "crypto", "solana": "crypto", "sol": "crypto", "xrp": "crypto",
    "token": "crypto", "defi": "crypto", "blockchain": "crypto",
    "trump": "politics", "biden": "politics", "election": "politics",
    "republican": "politics", "democrat": "politics", "congress": "politics",
    "nba": "sports", "nfl": "sports", "mlb": "sports", "soccer": "sports",
    "football": "sports", "basketball": "sports", "tennis": "sports",
    "stock": "finance", "fed": "finance", "interest rate": "finance",
    "gdp": "finance", "inflation": "finance", "s&p": "finance",
    "war": "geopolitics", "iran": "geopolitics", "russia": "geopolitics",
    "ukraine": "geopolitics", "china": "geopolitics",
    "ai": "tech", "apple": "tech", "google": "tech", "openai": "tech",
    "movie": "culture", "oscar": "culture", "grammy": "culture",
}


def _parse_slug_timing(slug: str) -> tuple[float | None, int]:
    """Extract round start timestamp and duration from slug.

    Slug pattern: btc-updown-5m-1773400800
    Returns (start_epoch, duration_seconds). None if can't parse.
    """
    # Extract duration: -5m-, -15m-, -1h-, -4h-, -24h-
    duration_sec = 0
    dur_match = re.search(r"-(\d+)(m|h)-", slug.lower())
    if dur_match:
        val, unit = int(dur_match.group(1)), dur_match.group(2)
        duration_sec = val * 60 if unit == "m" else val * 3600
    # Extract Unix timestamp (last numeric segment)
    ts_match = re.search(r"-(\d{10,})$", slug)
    start_epoch = float(ts_match.group(1)) if ts_match else None
    return start_epoch, duration_sec


def _calc_round_time_remaining(slug: str) -> float | None:
    """Calculate minutes remaining in the current round from slug timestamp.

    Returns None if slug can't be parsed.
    """
    start_epoch, duration_sec = _parse_slug_timing(slug)
    if start_epoch is None or duration_sec <= 0:
        return None
    end_epoch = start_epoch + duration_sec
    now_epoch = datetime.now(timezone.utc).timestamp()
    remaining = (end_epoch - now_epoch) / 60.0
    return round(remaining, 1)


def _match_timeframe(slug: str, max_expiry_minutes: int) -> bool:
    """Check if event/market slug matches the desired timeframe.

    Polymarket slug patterns: btc-updown-5m-xxx, eth-updown-15m-xxx, etc.
    max_expiry_minutes=5  → match '-5m-' in slug
    max_expiry_minutes=15 → match '-5m-' or '-15m-'
    max_expiry_minutes=60 → match '-5m-', '-15m-', '-1h-'
    max_expiry_minutes=240 → also match '-4h-'
    max_expiry_minutes=1440 → also match 'daily'
    max_expiry_minutes=0 → no filter (all pass)
    """
    if max_expiry_minutes <= 0:
        return True
    slug_lower = slug.lower()
    allowed_patterns = []
    if max_expiry_minutes >= 5:
        allowed_patterns.append("-5m-")
    if max_expiry_minutes >= 15:
        allowed_patterns.append("-15m-")
    if max_expiry_minutes >= 60:
        allowed_patterns.append("-1h-")
    if max_expiry_minutes >= 240:
        allowed_patterns.append("-4h-")
    if max_expiry_minutes >= 1440:
        allowed_patterns.extend(["daily", "-24h-"])
    if not allowed_patterns:
        return False
    return any(p in slug_lower for p in allowed_patterns)


def _resolve_tag(keywords: list[str]) -> str:
    """Resolve category keywords to a single Gamma API tag."""
    if not keywords:
        return ""
    tag_counts: dict[str, int] = {}
    for kw in keywords:
        tag = _KEYWORD_TO_TAG.get(kw.lower(), "")
        if tag:
            tag_counts[tag] = tag_counts.get(tag, 0) + 1
    if not tag_counts:
        return ""
    return max(tag_counts, key=tag_counts.get)


async def _fetch_daily_crypto_markets(client: PolymarketClient) -> list[dict]:
    """Fetch daily crypto price prediction markets (e.g. 'Bitcoin above $72k on March 13?').
    These are high-volume markets tradeable right now, unlike 5-min rounds that may not be active.
    """
    import httpx
    from datetime import datetime, timezone, timedelta

    now = datetime.now(timezone.utc)
    markets = []

    # Search for today's and tomorrow's crypto price events
    # Common slug patterns: bitcoin-above-on-march-13, bitcoin-price-on-march-13
    search_queries = []
    for day_offset in range(0, 3):  # today, tomorrow, day after
        d = now + timedelta(days=day_offset)
        month_name = d.strftime("%B").lower()  # "march"
        day_num = d.day
        search_queries.append(f"Bitcoin above {month_name} {day_num}")
        search_queries.append(f"Bitcoin price {month_name} {day_num}")
        search_queries.append(f"Ethereum above {month_name} {day_num}")

    try:
        for query in search_queries:
            result = await client.public_search(query, limit=5)
            events = result.get("events", [])
            for ev in events:
                slug = ev.get("slug", "")
                # Only include crypto price prediction events
                if not any(kw in slug for kw in ["bitcoin-above", "bitcoin-price", "ethereum-above", "ethereum-price", "btc-updown", "eth-updown"]):
                    continue
                # Check if event ends in the future
                end_str = ev.get("endDate", "")
                if end_str:
                    try:
                        end_dt = datetime.fromisoformat(end_str.replace("Z", "+00:00"))
                        if end_dt <= now:
                            continue  # Already ended
                    except Exception:
                        pass
                for m in ev.get("markets", []):
                    if m.get("active") and not m.get("closed"):
                        markets.append(m)
    except Exception as e:
        logger.warning(f"AI Trader: failed to fetch daily crypto markets: {e}")

    logger.info(f"AI Trader: found {len(markets)} daily crypto price markets")
    return markets


def _calc_time_remaining_from_end_date(end_date_str: str) -> float | None:
    """Calculate minutes remaining from an ISO endDate string."""
    if not end_date_str:
        return None
    try:
        end_dt = datetime.fromisoformat(end_date_str.replace("Z", "+00:00"))
        now = datetime.now(timezone.utc)
        remaining = (end_dt - now).total_seconds() / 60.0
        return round(remaining, 1)
    except Exception:
        return None


def _detect_market_type(slug: str, question: str = "") -> str:
    """Detect market type from slug pattern and question.
    Returns '5m_updown', '15m_updown', 'daily_price', or 'other'.
    """
    slug_lower = slug.lower()
    q_lower = question.lower()
    if "-updown-5m-" in slug_lower or "-5m-" in slug_lower:
        return "5m_updown"
    if "-updown-15m-" in slug_lower or "-15m-" in slug_lower:
        return "15m_updown"
    # Daily crypto price markets: "Bitcoin above $X on DATE" or "Bitcoin between $X-$Y on DATE"
    crypto_price_patterns = [
        "bitcoin-above", "bitcoin-price", "ethereum-above", "ethereum-price",
        "price-of-bitcoin", "price-of-ethereum",
    ]
    if any(kw in slug_lower for kw in crypto_price_patterns):
        return "daily_price"
    # Also detect from question text
    if any(kw in q_lower for kw in ["price of bitcoin be above", "price of bitcoin be between",
                                     "price of bitcoin be less", "price of bitcoin be greater",
                                     "price of ethereum be above", "price of ethereum be between"]):
        return "daily_price"
    return "other"


def _extract_coin_from_question(question: str) -> str | None:
    """Extract coin symbol from market question.
    e.g. 'Will the price of Bitcoin be above $72,000?' → 'BTC'
    """
    q_lower = question.lower()
    coin_map = {
        "bitcoin": "BTC", "btc": "BTC",
        "ethereum": "ETH", "eth": "ETH",
        "solana": "SOL", "sol": "SOL",
        "xrp": "XRP",
    }
    for keyword, symbol in coin_map.items():
        if keyword in q_lower:
            return symbol
    return None


async def ai_analyze_markets(
    client: PolymarketClient,
    config: dict,
    current_positions: list[dict],
    budget_remaining: float,
) -> list[dict]:
    """Use Claude to decide which markets to buy."""
    settings = get_settings()
    if not settings.ANTHROPIC_API_KEY or settings.ANTHROPIC_API_KEY == "your-anthropic-api-key-here":
        logger.warning("No Anthropic API key configured, falling back to scanner logic")
        return await _fallback_scan(client, config, current_positions)

    filters = config.get("filters", {})
    max_expiry_minutes = filters.get("max_expiry_minutes", 0)
    category_keywords = [kw.lower() for kw in filters.get("category_keywords", [])]
    position_size = config.get("position_size_usdc", 50)
    max_positions = config.get("max_open_positions", 10)
    max_new = max_positions - len(current_positions)

    if max_new <= 0 or budget_remaining < position_size:
        return []

    # Determine API tag from category keywords
    tag = _resolve_tag(category_keywords)

    # Fetch markets — Events API + daily crypto price markets
    all_markets: list[dict] = []
    try:
        if tag:
            # Events API: 태그 기반으로 이벤트 → 하위 마켓 추출
            events = await client.get_events(limit=30, active=True, tag=tag)
            for ev in events:
                for m in ev.get("markets", []):
                    if m.get("active") and not m.get("closed"):
                        all_markets.append(m)
            logger.info(f"AI Trader: fetched {len(events)} events ({len(all_markets)} markets) via tag={tag}")

        # Also search for daily crypto price markets (high-volume, tradeable NOW)
        # These have slugs like "bitcoin-above-on-march-13", "bitcoin-price-on-march-13"
        daily_markets = await _fetch_daily_crypto_markets(client)
        existing_ids = {m.get("conditionId", m.get("condition_id")) for m in all_markets}
        for m in daily_markets:
            cid = m.get("conditionId", m.get("condition_id", ""))
            if cid and cid not in existing_ids:
                all_markets.append(m)
                existing_ids.add(cid)

        if len(all_markets) < 10:
            # 보충: 일반 마켓 API
            extra = await client.get_markets(limit=50, active=True, tag=tag)
            for m in extra:
                cid = m.get("conditionId", m.get("condition_id", ""))
                if cid and cid not in existing_ids:
                    all_markets.append(m)
    except Exception as e:
        logger.error(f"AI Trader: failed to fetch markets: {e}")
        return []

    # Parse and filter markets
    now = datetime.now(timezone.utc)
    filtered = []
    for m in all_markets:
        outcome_prices = m.get("outcomePrices", [])
        if isinstance(outcome_prices, str):
            try:
                outcome_prices = json.loads(outcome_prices)
            except Exception:
                continue
        if not outcome_prices or len(outcome_prices) < 2:
            continue

        tokens = m.get("clobTokenIds", [])
        if isinstance(tokens, str):
            try:
                tokens = json.loads(tokens)
            except Exception:
                tokens = []

        volume = float(m.get("volume24hr", 0) or m.get("volume", 0) or 0)
        liquidity = float(m.get("liquidityNum", 0) or 0)
        end_date_str = m.get("endDate", "")
        slug = m.get("slug", "")
        market_type = _detect_market_type(slug, m.get("question", ""))

        # Apply timeframe filter — slug 패턴 매칭 (5m, 15m, 1h, 4h, daily 등)
        # Daily price markets always pass through (they're our fallback when no 5m rounds)
        if max_expiry_minutes > 0 and market_type not in ("daily_price",):
            if not _match_timeframe(slug, max_expiry_minutes):
                continue

        # Apply category keyword filter (tag 이미 적용됐으므로, 없을 때만 로컬 필터)
        if category_keywords and not tag and market_type not in ("daily_price",):
            question = (m.get("question", "") or "").lower()
            description = (m.get("description", "") or "").lower()
            search_text = question + " " + description
            if not any(kw in search_text for kw in category_keywords):
                continue

        # Parse outcomes (Up/Down or Yes/No)
        outcomes_raw = m.get("outcomes", '["Yes", "No"]')
        if isinstance(outcomes_raw, str):
            try:
                outcomes_list = json.loads(outcomes_raw)
            except Exception:
                outcomes_list = ["Yes", "No"]
        else:
            outcomes_list = outcomes_raw or ["Yes", "No"]

        up_label = outcomes_list[0] if outcomes_list else "Yes"
        down_label = outcomes_list[1] if len(outcomes_list) > 1 else "No"
        up_price = float(outcome_prices[0])
        down_price = float(outcome_prices[1])

        # Calculate time remaining
        if market_type in ("5m_updown", "15m_updown"):
            # From slug timestamp: btc-updown-5m-1773400800
            time_remaining_min = _calc_round_time_remaining(slug)
            _, round_duration_sec = _parse_slug_timing(slug)
            round_duration_min = round_duration_sec / 60 if round_duration_sec > 0 else None
        else:
            # From endDate for daily/other markets
            time_remaining_min = _calc_time_remaining_from_end_date(end_date_str)
            round_duration_min = None

        # Skip markets that already ended
        if time_remaining_min is not None and time_remaining_min <= 0:
            continue

        # Skip rounds that haven't started yet (for short-term slug-based markets only)
        if round_duration_min and round_duration_min <= 60 and time_remaining_min is not None:
            if time_remaining_min > round_duration_min:
                continue

        # Skip daily markets where prices are fully decided (Yes ≥ 0.99 or ≤ 0.01)
        if market_type == "daily_price":
            if up_price >= 0.99 or up_price <= 0.01:
                continue

        # Detect coin from slug or question
        coin = _extract_coin_from_slug(slug) or _extract_coin_from_question(m.get("question", ""))

        filtered.append({
            "condition_id": m.get("conditionId", m.get("condition_id", "")),
            "question": m.get("question", ""),
            "slug": slug,
            "market_type": market_type,
            "coin": coin,
            "up_label": up_label,
            "down_label": down_label,
            "up_price": up_price,
            "down_price": down_price,
            "spread": round(abs(up_price - down_price), 4),
            "time_remaining_min": time_remaining_min,
            "round_duration_min": round_duration_min,
            "volume_24h": round(volume),
            "liquidity": round(liquidity),
            "end_date": end_date_str,
            "best_bid": float(m.get("bestBid", 0) or 0),
            "best_ask": float(m.get("bestAsk", 0) or 0),
            "up_token_id": tokens[0] if tokens and len(tokens) >= 1 else "",
            "down_token_id": tokens[1] if tokens and len(tokens) >= 2 else "",
        })

    logger.info(f"AI Trader: {len(all_markets)} markets total, {len(filtered)} active rounds after filters (expiry={max_expiry_minutes}min, tag={tag})")

    if not filtered:
        logger.info("AI Trader: no active rounds found — all rounds are either ended or not yet started. Waiting for next round...")
        return []

    # Fetch real-time crypto prices
    crypto_prices = await _fetch_crypto_prices()
    logger.info(f"AI Trader: crypto prices: {crypto_prices}")

    # Build prompt
    existing_conditions = {p.get("condition_id") for p in current_positions}
    mode = "PAPER TRADING (simulation)" if settings.POLYMARKET_PAPER_TRADING else "LIVE TRADING (real money)"

    # Simplify market data for prompt (remove token IDs, keep what AI needs)
    markets_for_prompt = []
    for m in filtered[:30]:
        entry = {
            "condition_id": m["condition_id"],
            "question": m["question"],
            "market_type": m.get("market_type", "other"),
            "coin": m.get("coin"),
            "up_price": m["up_price"],
            "down_price": m["down_price"],
            "spread": m["spread"],
            "time_remaining_min": m["time_remaining_min"],
            "volume_24h": m["volume_24h"],
            "liquidity": m["liquidity"],
            "best_bid": m["best_bid"],
            "best_ask": m["best_ask"],
        }
        if m.get("round_duration_min"):
            entry["round_duration_min"] = m["round_duration_min"]
        if m.get("end_date"):
            entry["settlement_time"] = m["end_date"]
        markets_for_prompt.append(entry)

    # Format crypto prices for prompt
    crypto_prices_str = json.dumps(
        {f"{k}/USD": f"${v:,.2f}" for k, v in crypto_prices.items()} if crypto_prices else {"note": "unavailable"},
        indent=2,
    )

    prompt = BUY_PROMPT.format(
        count=len(filtered),
        budget=budget_remaining,
        position_size=position_size,
        max_new=max_new,
        now=now.strftime("%Y-%m-%d %H:%M:%S UTC"),
        mode=mode,
        crypto_prices_json=crypto_prices_str,
        markets_json=json.dumps(markets_for_prompt, indent=2),
        positions_json=json.dumps(
            [{"condition_id": p.get("condition_id"), "question": p.get("question", ""), "outcome": p.get("outcome"), "entry_price": p.get("entry_price")}
             for p in current_positions],
            indent=2,
        ),
    )

    # Call Claude
    try:
        import httpx
        async with httpx.AsyncClient(timeout=30.0) as http:
            resp = await http.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": settings.ANTHROPIC_API_KEY,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json={
                    "model": "claude-sonnet-4-20250514",
                    "max_tokens": 2000,
                    "system": SYSTEM_PROMPT,
                    "messages": [{"role": "user", "content": prompt}],
                },
            )
            resp.raise_for_status()
            data = resp.json()
    except Exception as e:
        logger.error(f"AI Trader: Claude API call failed: {e}")
        return await _fallback_scan(client, config, current_positions)

    # Parse response
    try:
        content = data["content"][0]["text"]
        logger.debug(f"AI Trader: Claude raw response: {content[:500]}")
        # Strip markdown code blocks if present
        if content.strip().startswith("```"):
            content = content.strip().split("\n", 1)[1].rsplit("```", 1)[0]
        result = json.loads(content)
        decisions = result.get("decisions", [])
        logger.info(f"AI Trader: Claude returned {len(decisions)} decisions")
        for d in decisions:
            logger.info(f"  → {d.get('action')} {d.get('outcome')} {d.get('condition_id','')} conf={d.get('confidence',0)} reason={d.get('reason','')}")
    except Exception as e:
        logger.error(f"AI Trader: failed to parse Claude response: {e}")
        logger.error(f"  raw content: {data.get('content', [{}])[0].get('text', '')[:300]}")
        return []

    # Convert decisions to opportunities
    market_map = {m["condition_id"]: m for m in filtered}
    opportunities = []

    for d in decisions:
        if d.get("action") != "buy":
            continue
        cid = d.get("condition_id", "")
        if cid in existing_conditions:
            continue
        if cid not in market_map:
            continue

        confidence = d.get("confidence", 0)
        if confidence < 0.7:
            logger.debug(f"AI Trader: skipping {cid} — confidence {confidence:.0%} below threshold 70%")
            continue

        m = market_map[cid]
        outcome = d.get("outcome", "Up")
        # Map Up/Down/Yes/No to first/second token
        is_up = outcome.lower() in ("up", "yes")
        if is_up:
            price = m["up_price"]
            token_id = m["up_token_id"]
            outcome = m["up_label"]  # Use actual label from market
        else:
            price = m["down_price"]
            token_id = m["down_token_id"]
            outcome = m["down_label"]

        opportunities.append({
            "condition_id": cid,
            "question": m["question"],
            "slug": m["slug"],
            "outcome": outcome,
            "token_id": token_id,
            "price": price,
            "up_price": m["up_price"],
            "down_price": m["down_price"],
            "volume_24h": m["volume_24h"],
            "liquidity": m["liquidity"],
            "end_date": m["end_date"],
            "ai_confidence": confidence,
            "ai_reason": d.get("reason", ""),
        })

    logger.info(f"AI Trader: Claude suggested {len(opportunities)} buys from {len(filtered)} markets")
    return opportunities


async def ai_check_exits(
    client: PolymarketClient,
    positions: list[dict],
) -> list[dict]:
    """Use Claude to decide which positions to sell."""
    settings = get_settings()
    if not settings.ANTHROPIC_API_KEY or settings.ANTHROPIC_API_KEY == "your-anthropic-api-key-here":
        # Fallback: basic take-profit / stop-loss
        return await _fallback_exits(client, positions)

    if not positions:
        return []

    # Get current prices via batch midpoints (much faster than sequential)
    now = datetime.now(timezone.utc)
    enriched_positions = []
    prices = {}

    token_ids = [pos.get("token_id", "") for pos in positions if pos.get("token_id")]
    if token_ids:
        try:
            prices = await client.get_midpoints(token_ids)
        except Exception as e:
            logger.warning(f"AI Trader: batch midpoints failed, falling back to sequential: {e}")
            for tid in token_ids:
                try:
                    prices[tid] = await client.get_midpoint(tid)
                except Exception:
                    pass

    for pos in positions:
        token_id = pos.get("token_id", "")
        entry_price = pos.get("entry_price", 0)
        current_price = prices.get(token_id, entry_price)

        roi_pct = ((current_price - entry_price) / entry_price * 100) if entry_price > 0 else 0

        # Calculate time remaining from slug timestamp
        slug = pos.get("market_slug", "")
        time_remaining_min = _calc_round_time_remaining(slug) if slug else None

        enriched_positions.append({
            "token_id": token_id,
            "question": pos.get("question", ""),
            "outcome": pos.get("outcome"),
            "entry_price": round(entry_price, 4),
            "current_price": round(current_price, 4),
            "roi_pct": round(roi_pct, 1),
            "quantity": pos.get("quantity"),
            "invested_usdc": round(entry_price * pos.get("quantity", 0), 2),
            "current_value_usdc": round(current_price * pos.get("quantity", 0), 2),
            "time_remaining_min": time_remaining_min,
            "entry_time": pos.get("entry_time", ""),
        })

    # Fetch real-time crypto prices for exit analysis too
    crypto_prices = await _fetch_crypto_prices()
    crypto_prices_str = json.dumps(
        {f"{k}/USD": f"${v:,.2f}" for k, v in crypto_prices.items()} if crypto_prices else {"note": "unavailable"},
        indent=2,
    )

    prompt = EXIT_PROMPT.format(
        now=now.strftime("%Y-%m-%d %H:%M:%S UTC"),
        crypto_prices_json=crypto_prices_str,
        positions_json=json.dumps(enriched_positions, indent=2),
    )

    try:
        import httpx
        async with httpx.AsyncClient(timeout=30.0) as http:
            resp = await http.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": settings.ANTHROPIC_API_KEY,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json={
                    "model": "claude-sonnet-4-20250514",
                    "max_tokens": 1000,
                    "system": SYSTEM_PROMPT,
                    "messages": [{"role": "user", "content": prompt}],
                },
            )
            resp.raise_for_status()
            data = resp.json()
    except Exception as e:
        logger.error(f"AI Trader: exit analysis failed: {e}")
        return await _fallback_exits(client, positions)

    try:
        content = data["content"][0]["text"]
        if content.strip().startswith("```"):
            content = content.strip().split("\n", 1)[1].rsplit("```", 1)[0]
        result = json.loads(content)
        decisions = result.get("decisions", [])
    except Exception as e:
        logger.error(f"AI Trader: failed to parse exit response: {e}")
        return []

    sell_token_ids = {d["token_id"] for d in decisions if d.get("action") == "sell"}

    exits = []
    for pos in positions:
        tid = pos.get("token_id", "")
        if tid in sell_token_ids:
            current_price = prices.get(tid, pos.get("entry_price", 0))
            entry_price = pos.get("entry_price", 0)
            pnl_pct = ((current_price - entry_price) / entry_price * 100) if entry_price > 0 else 0
            reason = next(
                (d.get("reason", "ai_exit") for d in decisions if d.get("token_id") == tid),
                "ai_exit",
            )
            exits.append({
                **pos,
                "current_price": current_price,
                "exit_reason": f"AI: {reason}",
                "pnl_pct": pnl_pct,
            })

    logger.info(f"AI Trader: Claude suggested {len(exits)} exits from {len(positions)} positions")
    return exits


# ─── Fallback: rule-based when no API key ────────────────────────────────

async def _fallback_scan(client, config, current_positions):
    """Fallback to rule-based scanning when Claude API is unavailable."""
    from core.polymarket_scanner import scan_markets
    return await scan_markets(client, config)


async def _fallback_exits(client, positions):
    """Fallback to basic TP/SL exits."""
    exits = []
    for pos in positions:
        token_id = pos.get("token_id", "")
        if not token_id:
            continue
        try:
            current_price = await client.get_midpoint(token_id)
        except Exception:
            continue

        entry_price = pos.get("entry_price", 0)
        if entry_price <= 0:
            continue

        pnl_pct = (current_price - entry_price) / entry_price * 100

        reason = None
        if current_price >= 0.80:
            reason = f"take_profit (price={current_price:.4f})"
        elif current_price <= 0.01:
            reason = f"stop_loss (price={current_price:.4f})"
        elif pnl_pct >= 100:
            reason = f"take_profit_pct (+{pnl_pct:.0f}%)"

        if reason:
            exits.append({
                **pos,
                "current_price": current_price,
                "exit_reason": reason,
                "pnl_pct": pnl_pct,
            })

    return exits
