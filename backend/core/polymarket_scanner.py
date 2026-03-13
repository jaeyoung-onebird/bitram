"""
BITRAM Polymarket Scanner & Arbitrage Engine
Discovers market opportunities based on user-defined conditions.
"""
import logging
from datetime import datetime, timezone
from typing import Optional

from core.polymarket_client import PolymarketClient

logger = logging.getLogger(__name__)


# ─── Scanner: Condition-based market discovery ────────────────────────────

async def scan_markets(client: PolymarketClient, config: dict) -> list[dict]:
    """
    Scan Polymarket for markets matching entry conditions.

    Config schema:
    {
        "filters": {
            "min_volume_24h": 10000,
            "min_liquidity": 5000,
            "categories": []  # empty = all
        },
        "entry_conditions": {
            "outcome": "Yes",          # "Yes" or "No"
            "max_price": 0.30,         # Buy when price <= this
            "min_price": 0.05          # Don't buy below this (likely dead markets)
        },
        "position_size_usdc": 50,
        "max_open_positions": 10
    }
    """
    filters = config.get("filters", {})
    entry = config.get("entry_conditions", {})

    min_volume = filters.get("min_volume_24h", 5000)
    min_liquidity = filters.get("min_liquidity", 1000)
    categories = filters.get("categories", [])
    category_keywords = [kw.lower() for kw in filters.get("category_keywords", [])]
    max_expiry_minutes = filters.get("max_expiry_minutes", 0)  # 0 = no limit

    target_outcome = entry.get("outcome", "Yes")
    max_price = entry.get("max_price", 0.30)
    min_price = entry.get("min_price", 0.05)

    opportunities = []

    # Determine API tag from category keywords
    from core.polymarket_ai_trader import _resolve_tag
    tag = _resolve_tag(category_keywords)

    # Fetch markets — Events API 우선 (태그 기반 5분/15분 마켓 포함)
    markets: list[dict] = []
    try:
        if tag:
            events = await client.get_events(limit=30, active=True, tag=tag)
            for ev in events:
                for m in ev.get("markets", []):
                    if m.get("active") and not m.get("closed"):
                        markets.append(m)
            logger.info(f"Scanner: {len(events)} events, {len(markets)} markets via tag={tag}")
        if len(markets) < 10:
            extra = await client.get_markets(limit=100, active=True, tag=tag)
            existing = {m.get("conditionId", m.get("condition_id")) for m in markets}
            for m in extra:
                cid = m.get("conditionId", m.get("condition_id", ""))
                if cid and cid not in existing:
                    markets.append(m)
    except Exception as e:
        logger.error(f"Failed to fetch markets: {e}")
        return []

    for market in markets:
        try:
            # Filter by timeframe — slug 패턴 매칭 (5m, 15m, 1h 등)
            if max_expiry_minutes > 0:
                from core.polymarket_ai_trader import _match_timeframe
                slug = market.get("slug", "")
                if not _match_timeframe(slug, max_expiry_minutes):
                    continue

            # Filter by volume
            volume = float(market.get("volume24hr", 0) or 0)
            if volume < min_volume:
                continue

            # Filter by liquidity
            liquidity = float(market.get("liquidityNum", 0) or 0)
            if liquidity < min_liquidity:
                continue

            # Filter by category tags
            if categories:
                market_tags = market.get("tags", []) or []
                if isinstance(market_tags, str):
                    import json as _json
                    try:
                        market_tags = _json.loads(market_tags)
                    except Exception:
                        market_tags = []
                if not any(cat.lower() in [t.lower() for t in market_tags] for cat in categories):
                    continue

            # Filter by category keywords (tag 이미 적용됐으면 스킵)
            if category_keywords and not tag:
                question = (market.get("question", "") or "").lower()
                description = (market.get("description", "") or "").lower()
                search_text = question + " " + description
                if not any(kw in search_text for kw in category_keywords):
                    continue

            # Check token prices — Gamma API returns these as JSON strings
            tokens = market.get("clobTokenIds", []) or market.get("tokens", [])
            if isinstance(tokens, str):
                import json as _json
                try:
                    tokens = _json.loads(tokens)
                except Exception:
                    tokens = []
            outcomes = market.get("outcomes", ["Yes", "No"])
            if isinstance(outcomes, str):
                import json as _json
                try:
                    outcomes = _json.loads(outcomes)
                except Exception:
                    outcomes = ["Yes", "No"]

            if not tokens or len(tokens) < 2:
                continue

            # Get prices from market data — may be JSON string
            outcome_prices = market.get("outcomePrices", [])
            if isinstance(outcome_prices, str):
                import json as _json
                try:
                    outcome_prices = _json.loads(outcome_prices)
                except Exception:
                    outcome_prices = []
            if outcome_prices and len(outcome_prices) >= 2:
                yes_price = float(outcome_prices[0])
                no_price = float(outcome_prices[1])
            else:
                continue

            # Determine target price
            if target_outcome == "Yes":
                target_price = yes_price
                target_token_id = tokens[0] if isinstance(tokens[0], str) else tokens[0].get("token_id", "")
            else:
                target_price = no_price
                target_token_id = tokens[1] if isinstance(tokens[1], str) else tokens[1].get("token_id", "")

            # Check entry conditions
            if min_price <= target_price <= max_price:
                opportunities.append({
                    "condition_id": market.get("conditionId", market.get("condition_id", "")),
                    "question": market.get("question", ""),
                    "slug": market.get("slug", ""),
                    "outcome": target_outcome,
                    "token_id": target_token_id,
                    "price": target_price,
                    "yes_price": yes_price,
                    "no_price": no_price,
                    "volume_24h": volume,
                    "liquidity": liquidity,
                    "end_date": market.get("endDate", ""),
                })

        except Exception as e:
            logger.debug(f"Error processing market: {e}")
            continue

    # Sort by volume descending
    opportunities.sort(key=lambda x: x["volume_24h"], reverse=True)
    return opportunities


async def check_exit_conditions(
    client: PolymarketClient,
    positions: list[dict],
    config: dict,
) -> list[dict]:
    """
    Check which positions should be exited.

    Position schema:
    {
        "token_id": "...",
        "market_slug": "...",
        "outcome": "Yes",
        "entry_price": 0.20,
        "quantity": 100,
        "entry_time": "2026-02-01T00:00:00Z"
    }

    Config exit_conditions:
    {
        "take_profit_price": 0.60,
        "stop_loss_price": 0.02,
        "time_exit_hours": 168
    }
    """
    exit_conds = config.get("exit_conditions", {})
    tp_price = exit_conds.get("take_profit_price", 0.80)
    sl_price = exit_conds.get("stop_loss_price", 0.01)
    time_exit_hours = exit_conds.get("time_exit_hours", 168)

    exits = []

    for pos in positions:
        try:
            token_id = pos.get("token_id", "")
            if not token_id:
                continue

            current_price = await client.get_midpoint(token_id)
            entry_price = pos.get("entry_price", 0)
            entry_time_str = pos.get("entry_time", "")

            reason = None

            # Take profit
            if current_price >= tp_price:
                reason = f"take_profit (price={current_price:.4f} >= {tp_price})"

            # Stop loss
            elif current_price <= sl_price:
                reason = f"stop_loss (price={current_price:.4f} <= {sl_price})"

            # Time exit
            elif entry_time_str and time_exit_hours > 0:
                try:
                    entry_time = datetime.fromisoformat(entry_time_str.replace("Z", "+00:00"))
                    elapsed_hours = (datetime.now(timezone.utc) - entry_time).total_seconds() / 3600
                    if elapsed_hours >= time_exit_hours:
                        reason = f"time_exit ({elapsed_hours:.0f}h >= {time_exit_hours}h)"
                except Exception:
                    pass

            if reason:
                exits.append({
                    **pos,
                    "current_price": current_price,
                    "exit_reason": reason,
                    "pnl_pct": ((current_price - entry_price) / entry_price * 100) if entry_price > 0 else 0,
                })

        except Exception as e:
            logger.debug(f"Error checking exit for position: {e}")
            continue

    return exits


# ─── Arbitrage: Same-market Yes+No spread ─────────────────────────────────

async def find_arbitrage_opportunities(
    client: PolymarketClient, config: dict
) -> list[dict]:
    """
    Find markets where Yes + No prices sum to less than 1.0 (minus fees).

    Config schema:
    {
        "min_spread": 0.02,         # Minimum profit margin after fees
        "min_volume_24h": 5000,
        "position_size_usdc": 100
    }
    """
    min_spread = config.get("min_spread", 0.02)
    min_volume = config.get("min_volume_24h", 5000)
    fee_rate = config.get("fee_rate", 0.02)

    opportunities = []

    try:
        markets = await client.get_markets(limit=100, active=True)
    except Exception as e:
        logger.error(f"Failed to fetch markets for arbitrage: {e}")
        return []

    for market in markets:
        try:
            volume = float(market.get("volume24hr", 0) or 0)
            if volume < min_volume:
                continue

            outcome_prices = market.get("outcomePrices", [])
            if isinstance(outcome_prices, str):
                import json as _json
                try:
                    outcome_prices = _json.loads(outcome_prices)
                except Exception:
                    outcome_prices = []
            if not outcome_prices or len(outcome_prices) < 2:
                continue

            yes_price = float(outcome_prices[0])
            no_price = float(outcome_prices[1])

            # Arbitrage exists when Yes + No < 1.0 (after accounting for fees)
            total_cost = yes_price + no_price
            # If you buy both Yes and No, one will pay out $1.
            # Profit = $1 - total_cost - fees
            gross_profit = 1.0 - total_cost
            fees = total_cost * fee_rate
            net_profit = gross_profit - fees
            spread = net_profit

            if spread >= min_spread:
                tokens = market.get("clobTokenIds", []) or market.get("tokens", [])
                if isinstance(tokens, str):
                    import json as _json
                    try:
                        tokens = _json.loads(tokens)
                    except Exception:
                        tokens = []
                opportunities.append({
                    "condition_id": market.get("conditionId", market.get("condition_id", "")),
                    "question": market.get("question", ""),
                    "slug": market.get("slug", ""),
                    "yes_price": yes_price,
                    "no_price": no_price,
                    "total_cost": total_cost,
                    "spread": round(spread, 4),
                    "expected_profit_pct": round(spread / total_cost * 100, 2) if total_cost > 0 else 0,
                    "volume_24h": volume,
                    "yes_token_id": tokens[0] if tokens and len(tokens) >= 1 else "",
                    "no_token_id": tokens[1] if tokens and len(tokens) >= 2 else "",
                })

        except Exception as e:
            logger.debug(f"Error processing market for arbitrage: {e}")
            continue

    opportunities.sort(key=lambda x: x["spread"], reverse=True)
    return opportunities
