"""
BITRAM Backtesting Engine
Simulates strategy execution on historical OHLCV data.
"""
import pandas as pd
import numpy as np
from dataclasses import dataclass, field
from core.strategy_engine import evaluate_strategy


@dataclass
class BacktestResult:
    # Summary
    total_return_pct: float = 0.0
    benchmark_return_pct: float = 0.0  # Buy & hold
    total_trades: int = 0
    win_trades: int = 0
    lose_trades: int = 0
    win_rate: float = 0.0
    max_drawdown_pct: float = 0.0
    sharpe_ratio: float = 0.0
    profit_factor: float = 0.0
    avg_profit_pct: float = 0.0
    avg_loss_pct: float = 0.0
    avg_holding_bars: float = 0.0
    # Series
    equity_curve: list = field(default_factory=list)
    trades: list = field(default_factory=list)
    # Period
    start_date: str = ""
    end_date: str = ""
    total_bars: int = 0

    def to_dict(self) -> dict:
        return {
            "total_return_pct": round(self.total_return_pct, 2),
            "benchmark_return_pct": round(self.benchmark_return_pct, 2),
            "total_trades": self.total_trades,
            "win_trades": self.win_trades,
            "lose_trades": self.lose_trades,
            "win_rate": round(self.win_rate, 2),
            "max_drawdown_pct": round(self.max_drawdown_pct, 2),
            "sharpe_ratio": round(self.sharpe_ratio, 3),
            "profit_factor": round(self.profit_factor, 2),
            "avg_profit_pct": round(self.avg_profit_pct, 2),
            "avg_loss_pct": round(self.avg_loss_pct, 2),
            "avg_holding_bars": round(self.avg_holding_bars, 1),
            "equity_curve": self.equity_curve,
            "trades": self.trades,
            "start_date": self.start_date,
            "end_date": self.end_date,
            "total_bars": self.total_bars,
        }


def run_backtest(
    df: pd.DataFrame,
    strategy_config: dict,
    initial_capital: float = 10_000_000,
    fee_rate: float = 0.0005,
) -> BacktestResult:
    """
    Run backtest on OHLCV DataFrame with strategy config.

    df must have columns: time, open, high, low, close, volume
    """
    result = BacktestResult()
    if df.empty or len(df) < 10:
        return result

    df = df.sort_values("time").reset_index(drop=True)
    result.start_date = str(df["time"].iloc[0])
    result.end_date = str(df["time"].iloc[-1])
    result.total_bars = len(df)

    # Evaluate strategy signals
    df = evaluate_strategy(strategy_config, df)

    # Extract safety params
    safety = strategy_config.get("safety", {})
    stop_loss_pct = safety.get("stop_loss", -100) / 100  # e.g., -5 -> -0.05
    take_profit_pct = safety.get("take_profit", 100) / 100  # e.g., 10 -> 0.10
    max_position_pct = safety.get("max_position", 100) / 100

    # Action params
    action = strategy_config.get("action", {})
    amount_pct = action.get("amount", 10) / 100

    # Simulate
    capital = initial_capital
    position = None  # {"entry_price", "quantity", "entry_bar", "entry_time"}
    equity_curve = []
    trades = []
    peak_equity = initial_capital

    for i in range(len(df)):
        row = df.iloc[i]
        current_price = float(row["close"])
        current_time = str(row["time"])

        # Calculate current equity
        if position:
            pos_value = position["quantity"] * current_price
            equity = capital + pos_value
        else:
            equity = capital

        equity_curve.append({
            "time": current_time,
            "equity": round(equity, 0),
            "price": current_price,
        })

        # Update peak for drawdown
        if equity > peak_equity:
            peak_equity = equity

        # Check exit conditions if in position
        if position:
            pnl_pct = (current_price - position["entry_price"]) / position["entry_price"]

            should_exit = False
            exit_reason = ""

            if pnl_pct <= stop_loss_pct:
                should_exit = True
                exit_reason = f"손절 ({pnl_pct*100:.1f}%)"
            elif pnl_pct >= take_profit_pct:
                should_exit = True
                exit_reason = f"익절 ({pnl_pct*100:.1f}%)"

            if should_exit:
                sell_value = position["quantity"] * current_price
                fee = sell_value * fee_rate
                profit = sell_value - fee - position["cost"]
                profit_pct_actual = profit / position["cost"] * 100

                capital += sell_value - fee

                trades.append({
                    "entry_time": position["entry_time"],
                    "exit_time": current_time,
                    "entry_price": position["entry_price"],
                    "exit_price": current_price,
                    "quantity": position["quantity"],
                    "profit": round(profit, 0),
                    "profit_pct": round(profit_pct_actual, 2),
                    "holding_bars": i - position["entry_bar"],
                    "reason": exit_reason,
                })
                position = None

        # Check entry signal if no position
        if position is None and bool(row.get("signal", False)):
            invest_amount = min(capital * amount_pct, capital * max_position_pct)
            if invest_amount < 5000:  # Upbit minimum
                continue

            fee = invest_amount * fee_rate
            net_amount = invest_amount - fee
            quantity = net_amount / current_price

            position = {
                "entry_price": current_price,
                "quantity": quantity,
                "cost": invest_amount,
                "entry_bar": i,
                "entry_time": current_time,
            }
            capital -= invest_amount

    # Close remaining position at last price
    if position:
        last_price = float(df.iloc[-1]["close"])
        sell_value = position["quantity"] * last_price
        fee = sell_value * fee_rate
        profit = sell_value - fee - position["cost"]
        profit_pct_actual = profit / position["cost"] * 100
        capital += sell_value - fee

        trades.append({
            "entry_time": position["entry_time"],
            "exit_time": str(df.iloc[-1]["time"]),
            "entry_price": position["entry_price"],
            "exit_price": last_price,
            "quantity": position["quantity"],
            "profit": round(profit, 0),
            "profit_pct": round(profit_pct_actual, 2),
            "holding_bars": len(df) - 1 - position["entry_bar"],
            "reason": "기간 종료",
        })

    # Calculate results
    final_equity = capital
    result.total_return_pct = (final_equity - initial_capital) / initial_capital * 100

    # Benchmark (buy & hold)
    first_price = float(df.iloc[0]["close"])
    last_price = float(df.iloc[-1]["close"])
    result.benchmark_return_pct = (last_price - first_price) / first_price * 100

    result.total_trades = len(trades)
    result.win_trades = len([t for t in trades if t["profit"] > 0])
    result.lose_trades = len([t for t in trades if t["profit"] <= 0])
    result.win_rate = (result.win_trades / result.total_trades * 100) if result.total_trades > 0 else 0

    # MDD
    equity_series = pd.Series([e["equity"] for e in equity_curve])
    rolling_max = equity_series.cummax()
    drawdown = (equity_series - rolling_max) / rolling_max
    result.max_drawdown_pct = float(drawdown.min()) * 100 if len(drawdown) > 0 else 0

    # Sharpe Ratio (annualized, assuming daily bars)
    if len(equity_curve) > 1:
        returns = equity_series.pct_change().dropna()
        if returns.std() > 0:
            result.sharpe_ratio = float(returns.mean() / returns.std() * np.sqrt(365))

    # Profit Factor
    gross_profit = sum(t["profit"] for t in trades if t["profit"] > 0)
    gross_loss = abs(sum(t["profit"] for t in trades if t["profit"] < 0))
    result.profit_factor = (gross_profit / gross_loss) if gross_loss > 0 else float("inf")

    # Average profit/loss
    winning = [t["profit_pct"] for t in trades if t["profit"] > 0]
    losing = [t["profit_pct"] for t in trades if t["profit"] <= 0]
    result.avg_profit_pct = np.mean(winning) if winning else 0
    result.avg_loss_pct = np.mean(losing) if losing else 0
    result.avg_holding_bars = np.mean([t["holding_bars"] for t in trades]) if trades else 0

    # Limit equity curve for response size (max 500 points)
    if len(equity_curve) > 500:
        step = len(equity_curve) // 500
        equity_curve = equity_curve[::step]

    result.equity_curve = equity_curve
    result.trades = trades

    return result
