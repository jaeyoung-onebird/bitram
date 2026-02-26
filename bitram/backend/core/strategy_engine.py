"""
BITRAM Strategy Engine
Parses JSON strategy configs and evaluates conditions against market data.
"""
import pandas as pd
import numpy as np
from core.indicators import compute_indicator, INDICATOR_REGISTRY


# ─── Operators ───────────────────────────────────────────────────────────────

OPERATORS = {
    "greater_than": lambda a, b: a > b,
    "less_than": lambda a, b: a < b,
    "equal": lambda a, b: a == b,
    "greater_equal": lambda a, b: a >= b,
    "less_equal": lambda a, b: a <= b,
    "crosses_above": None,  # Special handling
    "crosses_below": None,  # Special handling
}


def _crosses_above(series: pd.Series, value) -> pd.Series:
    if isinstance(value, (int, float)):
        prev = series.shift(1)
        return (prev <= value) & (series > value)
    else:
        prev_s = series.shift(1)
        prev_v = value.shift(1)
        return (prev_s <= prev_v) & (series > value)


def _crosses_below(series: pd.Series, value) -> pd.Series:
    if isinstance(value, (int, float)):
        prev = series.shift(1)
        return (prev >= value) & (series < value)
    else:
        prev_s = series.shift(1)
        prev_v = value.shift(1)
        return (prev_s >= prev_v) & (series < value)


# ─── Condition Evaluation ────────────────────────────────────────────────────

def evaluate_condition(condition: dict, df: pd.DataFrame) -> pd.Series:
    """
    Evaluate a single condition block against OHLCV DataFrame.

    condition example:
    {
        "indicator": "RSI",
        "params": {"period": 14},
        "output_key": null,         # for multi-output indicators like "k" for Stochastic
        "operator": "crosses_above",
        "value": 30,                # numeric or {"indicator": "SMA", ...}
    }
    """
    indicator_name = condition["indicator"]
    params = condition.get("params", {})
    output_key = condition.get("output_key")
    operator = condition["operator"]
    value = condition["value"]

    # Compute left side
    result = compute_indicator(indicator_name, df, params)
    if isinstance(result, dict) and output_key:
        left = result[output_key]
    elif isinstance(result, dict):
        left = list(result.values())[0]
    else:
        left = result

    # Compute right side
    if isinstance(value, dict) and "indicator" in value:
        right_result = compute_indicator(value["indicator"], df, value.get("params", {}))
        right_key = value.get("output_key")
        if isinstance(right_result, dict) and right_key:
            right = right_result[right_key]
        elif isinstance(right_result, dict):
            right = list(right_result.values())[0]
        else:
            right = right_result
    else:
        right = value

    # Apply operator
    if operator == "crosses_above":
        return _crosses_above(left, right)
    elif operator == "crosses_below":
        return _crosses_below(left, right)
    elif operator in OPERATORS:
        return OPERATORS[operator](left, right)
    else:
        raise ValueError(f"Unknown operator: {operator}")


def evaluate_conditions(conditions: list, logic: str, df: pd.DataFrame) -> pd.Series:
    """
    Evaluate multiple conditions combined with AND/OR logic.
    Returns a boolean Series.
    """
    if not conditions:
        return pd.Series(True, index=df.index)

    results = [evaluate_condition(c, df) for c in conditions]

    if logic == "OR":
        combined = results[0]
        for r in results[1:]:
            combined = combined | r
    else:  # AND (default)
        combined = results[0]
        for r in results[1:]:
            combined = combined & r

    return combined.fillna(False)


def evaluate_strategy(config: dict, df: pd.DataFrame) -> pd.DataFrame:
    """
    Full strategy evaluation. Returns DataFrame with signal column.

    config example:
    {
        "conditions": [...],
        "conditions_logic": "AND",
        "action": {"type": "market_buy", "amount_type": "percent", "amount": 10},
        "safety": {"stop_loss": -5, "take_profit": 10, "max_position": 30},
    }
    """
    conditions = config.get("conditions", [])
    logic = config.get("conditions_logic", "AND")

    df = df.copy()
    df["signal"] = evaluate_conditions(conditions, logic, df)

    return df


# ─── Strategy Validation ────────────────────────────────────────────────────

def validate_strategy_config(config: dict) -> list[str]:
    """Validate strategy config and return list of errors (empty = valid)."""
    errors = []

    if not config.get("conditions"):
        errors.append("최소 1개 이상의 조건이 필요합니다.")

    for i, cond in enumerate(config.get("conditions", [])):
        ind = cond.get("indicator")
        if ind not in INDICATOR_REGISTRY:
            errors.append(f"조건 {i+1}: 알 수 없는 지표 '{ind}'")
        op = cond.get("operator")
        if op not in OPERATORS:
            errors.append(f"조건 {i+1}: 알 수 없는 연산자 '{op}'")

    action = config.get("action", {})
    if action.get("type") not in ("market_buy", "limit_buy", "market_sell", "limit_sell"):
        errors.append("유효하지 않은 액션 타입입니다.")

    amount = action.get("amount", 0)
    if not (0 < amount <= 100):
        errors.append("투자 비율은 1~100% 사이여야 합니다.")

    safety = config.get("safety", {})
    sl = safety.get("stop_loss", 0)
    tp = safety.get("take_profit", 0)
    if sl and sl > 0:
        errors.append("손절은 음수(%)여야 합니다. 예: -5")
    if tp and tp < 0:
        errors.append("익절은 양수(%)여야 합니다. 예: 10")

    return errors


def get_available_indicators() -> list[dict]:
    """Return list of available indicators for the strategy builder UI."""
    result = []
    for name, spec in INDICATOR_REGISTRY.items():
        result.append({
            "name": name,
            "category": spec["category"],
            "params": spec["params"],
            "multi_output": spec.get("multi_output", False),
        })
    return result
