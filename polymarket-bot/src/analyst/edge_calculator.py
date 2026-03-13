"""Edge calculation and Kelly Criterion position sizing."""
from __future__ import annotations


def half_kelly_bet(
    my_probability: float,
    market_price: float,
    bankroll: float,
    side: str,
    max_position_pct: float = 0.15,
) -> float:
    """Calculate bet size using Half-Kelly Criterion.

    Full Kelly is optimal but high variance. Half-Kelly reduces drawdowns
    while keeping ~75% of the growth rate.

    Args:
        my_probability: Our estimated probability for the chosen side
        market_price: Market price for the chosen side (cost per share)
        bankroll: Total available capital
        side: "YES" or "NO"
        max_position_pct: Maximum bet as fraction of bankroll

    Returns:
        Recommended bet size in USD. 0 if no edge.
    """
    if market_price <= 0 or market_price >= 1:
        return 0.0

    # Odds: payout / cost
    # If you buy YES at $0.60, you pay $0.60 and win $1.00 → net $0.40
    # Odds (b) = net_win / cost = (1 - price) / price
    b = (1 - market_price) / market_price

    if b <= 0:
        return 0.0

    p = my_probability  # probability of winning
    q = 1 - p          # probability of losing

    # Kelly fraction: f* = (p * b - q) / b
    kelly = (p * b - q) / b

    if kelly <= 0:
        return 0.0

    # Half-Kelly for safety
    half_kelly = kelly * 0.5

    # Calculate bet in USD
    bet = half_kelly * bankroll

    # Cap at max position
    max_bet = max_position_pct * bankroll
    bet = min(bet, max_bet)

    return round(bet, 2)


def calculate_edge(
    my_probability: float,
    market_price: float,
) -> tuple[float, str]:
    """Calculate edge and recommended side.

    Returns (edge_as_decimal, "YES" | "NO" | "SKIP").
    """
    if my_probability > market_price:
        return (my_probability - market_price, "YES")
    elif my_probability < market_price:
        return (market_price - my_probability, "NO")
    else:
        return (0.0, "SKIP")


def expected_value(
    my_probability: float,
    price: float,
    side: str,
) -> float:
    """Expected value per dollar bet.

    EV = P(win) * payout - P(lose) * cost
    For $1 spent: shares = 1/price, payout = shares * $1 if win
    """
    if price <= 0 or price >= 1:
        return 0.0

    shares = 1.0 / price  # shares per $1

    if side == "YES":
        ev = my_probability * shares * 1.0 - 1.0  # net EV per $1
    else:
        ev = (1 - my_probability) * shares * 1.0 - 1.0
    return round(ev, 4)
