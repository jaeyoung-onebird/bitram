"""
BITRAM Technical Indicators Library
20+ indicators for strategy building
"""
import numpy as np
import pandas as pd


# ─── Trend Indicators ────────────────────────────────────────────────────────

def sma(series: pd.Series, period: int) -> pd.Series:
    return series.rolling(window=period, min_periods=period).mean()


def ema(series: pd.Series, period: int) -> pd.Series:
    return series.ewm(span=period, adjust=False).mean()


def wma(series: pd.Series, period: int) -> pd.Series:
    weights = np.arange(1, period + 1, dtype=float)
    return series.rolling(window=period).apply(
        lambda x: np.dot(x, weights) / weights.sum(), raw=True
    )


def macd(series: pd.Series, fast: int = 12, slow: int = 26, signal: int = 9) -> dict:
    ema_fast = ema(series, fast)
    ema_slow = ema(series, slow)
    macd_line = ema_fast - ema_slow
    signal_line = ema(macd_line, signal)
    histogram = macd_line - signal_line
    return {"macd": macd_line, "signal": signal_line, "histogram": histogram}


def ichimoku(high: pd.Series, low: pd.Series, close: pd.Series,
             tenkan: int = 9, kijun: int = 26, senkou_b: int = 52) -> dict:
    tenkan_sen = (high.rolling(tenkan).max() + low.rolling(tenkan).min()) / 2
    kijun_sen = (high.rolling(kijun).max() + low.rolling(kijun).min()) / 2
    senkou_a = ((tenkan_sen + kijun_sen) / 2).shift(kijun)
    senkou_b_line = ((high.rolling(senkou_b).max() + low.rolling(senkou_b).min()) / 2).shift(kijun)
    chikou = close.shift(-kijun)
    return {
        "tenkan": tenkan_sen, "kijun": kijun_sen,
        "senkou_a": senkou_a, "senkou_b": senkou_b_line, "chikou": chikou,
    }


# ─── Momentum Indicators ────────────────────────────────────────────────────

def rsi(series: pd.Series, period: int = 14) -> pd.Series:
    delta = series.diff()
    gain = delta.where(delta > 0, 0.0)
    loss = (-delta).where(delta < 0, 0.0)
    avg_gain = gain.ewm(alpha=1 / period, min_periods=period).mean()
    avg_loss = loss.ewm(alpha=1 / period, min_periods=period).mean()
    rs = avg_gain / avg_loss
    return 100 - (100 / (1 + rs))


def stochastic(high: pd.Series, low: pd.Series, close: pd.Series,
               k_period: int = 14, d_period: int = 3) -> dict:
    lowest = low.rolling(k_period).min()
    highest = high.rolling(k_period).max()
    k = 100 * (close - lowest) / (highest - lowest)
    d = k.rolling(d_period).mean()
    return {"k": k, "d": d}


def cci(high: pd.Series, low: pd.Series, close: pd.Series, period: int = 20) -> pd.Series:
    tp = (high + low + close) / 3
    sma_tp = tp.rolling(period).mean()
    mad = tp.rolling(period).apply(lambda x: np.abs(x - x.mean()).mean(), raw=True)
    return (tp - sma_tp) / (0.015 * mad)


def williams_r(high: pd.Series, low: pd.Series, close: pd.Series, period: int = 14) -> pd.Series:
    highest = high.rolling(period).max()
    lowest = low.rolling(period).min()
    return -100 * (highest - close) / (highest - lowest)


def mfi(high: pd.Series, low: pd.Series, close: pd.Series,
        volume: pd.Series, period: int = 14) -> pd.Series:
    tp = (high + low + close) / 3
    mf = tp * volume
    delta = tp.diff()
    pos_mf = mf.where(delta > 0, 0.0).rolling(period).sum()
    neg_mf = mf.where(delta <= 0, 0.0).rolling(period).sum()
    ratio = pos_mf / neg_mf
    return 100 - (100 / (1 + ratio))


# ─── Volatility Indicators ──────────────────────────────────────────────────

def bollinger_bands(series: pd.Series, period: int = 20, std_dev: float = 2.0) -> dict:
    mid = sma(series, period)
    std = series.rolling(window=period).std()
    upper = mid + std_dev * std
    lower = mid - std_dev * std
    pct_b = (series - lower) / (upper - lower)
    return {"upper": upper, "middle": mid, "lower": lower, "pct_b": pct_b}


def atr(high: pd.Series, low: pd.Series, close: pd.Series, period: int = 14) -> pd.Series:
    prev_close = close.shift(1)
    tr = pd.concat([
        high - low,
        (high - prev_close).abs(),
        (low - prev_close).abs(),
    ], axis=1).max(axis=1)
    return tr.ewm(span=period, adjust=False).mean()


def keltner_channel(high: pd.Series, low: pd.Series, close: pd.Series,
                    ema_period: int = 20, atr_period: int = 10, multiplier: float = 2.0) -> dict:
    mid = ema(close, ema_period)
    atr_val = atr(high, low, close, atr_period)
    upper = mid + multiplier * atr_val
    lower = mid - multiplier * atr_val
    return {"upper": upper, "middle": mid, "lower": lower}


def volatility_breakout(high: pd.Series, low: pd.Series, close: pd.Series,
                        k: float = 0.5) -> pd.Series:
    """Larry Williams' volatility breakout target price"""
    prev_range = (high - low).shift(1)
    target = close.shift(1) + prev_range * k
    return target


# ─── Volume Indicators ───────────────────────────────────────────────────────

def obv(close: pd.Series, volume: pd.Series) -> pd.Series:
    direction = np.sign(close.diff())
    return (direction * volume).fillna(0).cumsum()


def vwap(high: pd.Series, low: pd.Series, close: pd.Series, volume: pd.Series) -> pd.Series:
    tp = (high + low + close) / 3
    cum_tp_vol = (tp * volume).cumsum()
    cum_vol = volume.cumsum()
    return cum_tp_vol / cum_vol


def volume_spike(volume: pd.Series, period: int = 20, threshold: float = 2.0) -> pd.Series:
    avg_vol = volume.rolling(period).mean()
    return volume / avg_vol


def volume_ma(volume: pd.Series, period: int = 20) -> pd.Series:
    return sma(volume, period)


# ─── Price Action ────────────────────────────────────────────────────────────

def price_change_pct(close: pd.Series, period: int = 1) -> pd.Series:
    return close.pct_change(periods=period) * 100


def highest_high(high: pd.Series, period: int = 20) -> pd.Series:
    return high.rolling(period).max()


def lowest_low(low: pd.Series, period: int = 20) -> pd.Series:
    return low.rolling(period).min()


def pivot_points(high: pd.Series, low: pd.Series, close: pd.Series) -> dict:
    pp = (high + low + close) / 3
    r1 = 2 * pp - low
    s1 = 2 * pp - high
    r2 = pp + (high - low)
    s2 = pp - (high - low)
    return {"pp": pp, "r1": r1, "r2": r2, "s1": s1, "s2": s2}


# ─── Indicator Registry ──────────────────────────────────────────────────────

INDICATOR_REGISTRY = {
    # Trend
    "SMA": {"fn": "sma", "params": ["period"], "input": ["close"], "category": "trend"},
    "EMA": {"fn": "ema", "params": ["period"], "input": ["close"], "category": "trend"},
    "WMA": {"fn": "wma", "params": ["period"], "input": ["close"], "category": "trend"},
    "MACD": {"fn": "macd", "params": ["fast", "slow", "signal"], "input": ["close"], "category": "trend", "multi_output": True},
    "Ichimoku": {"fn": "ichimoku", "params": ["tenkan", "kijun", "senkou_b"], "input": ["high", "low", "close"], "category": "trend", "multi_output": True},

    # Momentum
    "RSI": {"fn": "rsi", "params": ["period"], "input": ["close"], "category": "momentum"},
    "Stochastic": {"fn": "stochastic", "params": ["k_period", "d_period"], "input": ["high", "low", "close"], "category": "momentum", "multi_output": True},
    "CCI": {"fn": "cci", "params": ["period"], "input": ["high", "low", "close"], "category": "momentum"},
    "Williams %R": {"fn": "williams_r", "params": ["period"], "input": ["high", "low", "close"], "category": "momentum"},
    "MFI": {"fn": "mfi", "params": ["period"], "input": ["high", "low", "close", "volume"], "category": "momentum"},

    # Volatility
    "Bollinger Bands": {"fn": "bollinger_bands", "params": ["period", "std_dev"], "input": ["close"], "category": "volatility", "multi_output": True},
    "ATR": {"fn": "atr", "params": ["period"], "input": ["high", "low", "close"], "category": "volatility"},
    "Keltner Channel": {"fn": "keltner_channel", "params": ["ema_period", "atr_period", "multiplier"], "input": ["high", "low", "close"], "category": "volatility", "multi_output": True},
    "Volatility Breakout": {"fn": "volatility_breakout", "params": ["k"], "input": ["high", "low", "close"], "category": "volatility"},

    # Volume
    "OBV": {"fn": "obv", "params": [], "input": ["close", "volume"], "category": "volume"},
    "VWAP": {"fn": "vwap", "params": [], "input": ["high", "low", "close", "volume"], "category": "volume"},
    "Volume Spike": {"fn": "volume_spike", "params": ["period", "threshold"], "input": ["volume"], "category": "volume"},
    "Volume MA": {"fn": "volume_ma", "params": ["period"], "input": ["volume"], "category": "volume"},

    # Price
    "Price Change %": {"fn": "price_change_pct", "params": ["period"], "input": ["close"], "category": "price"},
    "Highest High": {"fn": "highest_high", "params": ["period"], "input": ["high"], "category": "price"},
    "Lowest Low": {"fn": "lowest_low", "params": ["period"], "input": ["low"], "category": "price"},
    "Pivot Points": {"fn": "pivot_points", "params": [], "input": ["high", "low", "close"], "category": "price", "multi_output": True},
}


def compute_indicator(name: str, df: pd.DataFrame, params: dict) -> pd.Series | dict:
    """Compute an indicator by name with given parameters on OHLCV DataFrame."""
    if name not in INDICATOR_REGISTRY:
        raise ValueError(f"Unknown indicator: {name}")

    spec = INDICATOR_REGISTRY[name]
    func = globals()[spec["fn"]]

    # Build input args
    input_map = {"close": df["close"], "high": df["high"], "low": df["low"],
                 "open": df["open"], "volume": df["volume"]}
    args = [input_map[col] for col in spec["input"]]

    # Filter params to only expected ones
    expected_params = spec["params"]
    kwargs = {k: v for k, v in params.items() if k in expected_params}

    return func(*args, **kwargs)
