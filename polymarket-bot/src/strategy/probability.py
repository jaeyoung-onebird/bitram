"""Probability estimation engine — Binance price → outcome probability.

For 5-min BTC Up/Down markets:
  - Compare current price vs reference price (at round start)
  - Factor in momentum, volatility, and time remaining
  - Output: probability that "Up" wins (price ends above reference)
"""
from __future__ import annotations

import math
from dataclasses import dataclass


@dataclass
class ProbabilityEstimate:
    """Estimated probability with metadata."""
    up_probability: float       # P(price ends above reference)
    down_probability: float     # 1 - up_probability
    confidence: float           # how sure we are (0-1)
    edge_vs_market: float       # our estimate - market price (signed)
    momentum_pct: float         # recent price change %
    volatility_pct: float       # recent volatility %
    seconds_remaining: float


def estimate_probability(
    reference_price: float,
    current_price: float,
    seconds_remaining: float,
    momentum_10s_pct: float = 0.0,
    volatility_60s_pct: float = 0.0,
) -> ProbabilityEstimate:
    """Estimate probability that BTC ends above reference price.

    Uses a simple model combining:
    1. Current position (above/below reference)
    2. Time decay (less time = more certainty)
    3. Momentum (recent price direction)
    4. Volatility (how much could still change)

    Args:
        reference_price: BTC price at round start
        current_price: Live BTC price now
        seconds_remaining: Seconds until round ends
        momentum_10s_pct: Price change % over last 10 seconds
        volatility_60s_pct: Std dev of price over last 60s (as %)

    Returns:
        ProbabilityEstimate with Up/Down probabilities.
    """
    if reference_price <= 0:
        return ProbabilityEstimate(0.5, 0.5, 0.0, 0.0, momentum_10s_pct, volatility_60s_pct, seconds_remaining)

    pct_diff = (current_price - reference_price) / reference_price * 100

    # Time factor: how much do we trust current direction?
    # Less time → more certainty that current position holds
    if seconds_remaining <= 5:
        time_factor = 0.97
    elif seconds_remaining <= 10:
        time_factor = 0.90
    elif seconds_remaining <= 30:
        time_factor = 0.78
    elif seconds_remaining <= 60:
        time_factor = 0.62
    elif seconds_remaining <= 120:
        time_factor = 0.52
    else:
        time_factor = 0.50

    # Direction signal: how far are we from reference?
    # Scale by volatility and remaining time — more time = more could change
    base_vol = max(volatility_60s_pct, 0.01)
    # More time remaining → scale UP the effective volatility (more uncertainty)
    time_vol_scale = math.sqrt(max(seconds_remaining, 1) / 60)
    effective_vol = base_vol * time_vol_scale

    z_score = pct_diff / max(effective_vol, 0.001)

    # Sigmoid mapping: z_score → base probability
    base_prob = 1.0 / (1.0 + math.exp(-z_score * 0.8))

    # Blend: time_factor determines how much we lean toward the current direction
    if pct_diff > 0:
        prob_up = time_factor + (1 - time_factor) * base_prob
    elif pct_diff < 0:
        prob_up = (1 - time_factor) * base_prob
    else:
        prob_up = 0.5

    # Momentum adjustment: recent trend adds/subtracts confidence
    # If price is above reference AND still going up → stronger
    momentum_boost = 0.0
    if abs(momentum_10s_pct) > 0.01:  # meaningful movement
        if pct_diff > 0 and momentum_10s_pct > 0:
            # Above reference + still rising = boost Up
            momentum_boost = min(momentum_10s_pct * 2, 0.05)
        elif pct_diff < 0 and momentum_10s_pct < 0:
            # Below reference + still falling = boost Down
            momentum_boost = max(momentum_10s_pct * 2, -0.05)
        elif pct_diff > 0 and momentum_10s_pct < 0:
            # Above reference but falling = weaken Up slightly
            momentum_boost = max(momentum_10s_pct * 1, -0.03)
        elif pct_diff < 0 and momentum_10s_pct > 0:
            # Below reference but rising = weaken Down slightly
            momentum_boost = min(momentum_10s_pct * 1, 0.03)

    prob_up = max(0.01, min(0.99, prob_up + momentum_boost))

    # Confidence: how sure are we about this estimate
    confidence = _calc_confidence(pct_diff, seconds_remaining, volatility_60s_pct)

    return ProbabilityEstimate(
        up_probability=round(prob_up, 4),
        down_probability=round(1 - prob_up, 4),
        confidence=round(confidence, 4),
        edge_vs_market=0.0,  # caller fills this in
        momentum_pct=round(momentum_10s_pct, 4),
        volatility_pct=round(volatility_60s_pct, 4),
        seconds_remaining=seconds_remaining,
    )


def _calc_confidence(pct_diff: float, seconds_remaining: float, volatility: float) -> float:
    """How confident are we in this probability estimate (0-1)."""
    # Higher confidence when:
    # 1. Large price difference from reference
    # 2. Little time remaining
    # 3. Low volatility

    # Distance from reference (more = more confident)
    dist_score = min(abs(pct_diff) / 0.15, 1.0)  # saturate at 0.15%

    # Time pressure (less time = more confident)
    if seconds_remaining <= 10:
        time_score = 0.95
    elif seconds_remaining <= 30:
        time_score = 0.75
    elif seconds_remaining <= 60:
        time_score = 0.50
    elif seconds_remaining <= 120:
        time_score = 0.30
    else:
        time_score = 0.15

    # Low volatility = more predictable
    vol_score = max(0, 1.0 - volatility / 0.1)  # 0.1% vol = 0 confidence boost

    return max(0.1, min(0.95, dist_score * 0.4 + time_score * 0.5 + vol_score * 0.1))


def calc_edge(
    our_probability: float,
    market_price: float,
) -> float:
    """Calculate edge: our probability minus market's implied probability.

    Positive = we think outcome is more likely than market says (undervalued).
    """
    return our_probability - market_price
