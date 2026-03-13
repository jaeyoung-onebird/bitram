"""Risk manager — daily loss limits, circuit breaker, position sizing."""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone

from src.config import RiskConfig

logger = logging.getLogger(__name__)


class RiskManager:
    """Enforces risk limits for the trading bot."""

    def __init__(self, config: RiskConfig) -> None:
        self.config = config
        self.daily_pnl: float = 0.0
        self.consecutive_losses: int = 0
        self.total_trades: int = 0
        self.total_wins: int = 0
        self.open_positions: list[dict] = []
        self._circuit_breaker_active: bool = False
        self._last_reset_date: str = ""

    def can_trade(self) -> tuple[bool, str]:
        """Check if trading is allowed.

        Returns (allowed, reason_if_denied).
        """
        self._maybe_reset_daily()

        if self._circuit_breaker_active:
            return False, f"circuit breaker: {self.consecutive_losses} consecutive losses"

        if self.daily_pnl <= -self.config.max_daily_loss_usd:
            return False, f"daily loss limit: ${self.daily_pnl:.2f} (max -${self.config.max_daily_loss_usd})"

        if len(self.open_positions) >= self.config.max_concurrent_positions:
            return False, f"max positions: {len(self.open_positions)}/{self.config.max_concurrent_positions}"

        return True, ""

    def record_trade(self, pnl: float) -> None:
        """Record a completed trade result."""
        self.daily_pnl += pnl
        self.total_trades += 1

        if pnl > 0:
            self.total_wins += 1
            self.consecutive_losses = 0
        else:
            self.consecutive_losses += 1

        # Circuit breaker check
        if self.consecutive_losses >= self.config.circuit_breaker_losses:
            self._circuit_breaker_active = True
            logger.warning(
                f"CIRCUIT BREAKER: {self.consecutive_losses} consecutive losses. "
                f"Trading halted until daily reset."
            )

        win_rate = (self.total_wins / self.total_trades * 100) if self.total_trades > 0 else 0
        logger.info(
            f"Trade recorded: PnL=${pnl:+.2f}, "
            f"Daily=${self.daily_pnl:+.2f}, "
            f"Streak={'W' if pnl > 0 else 'L'}{self.consecutive_losses if pnl <= 0 else ''}, "
            f"WR={win_rate:.0f}% ({self.total_wins}/{self.total_trades})"
        )

    def reset_daily(self) -> None:
        """Reset daily counters (called at UTC midnight)."""
        logger.info(
            f"Daily reset — PnL=${self.daily_pnl:+.2f}, "
            f"Trades={self.total_trades}, Wins={self.total_wins}"
        )
        self.daily_pnl = 0.0
        self.consecutive_losses = 0
        self._circuit_breaker_active = False
        self._last_reset_date = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    def _maybe_reset_daily(self) -> None:
        """Auto-reset if day has changed."""
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        if self._last_reset_date and self._last_reset_date != today:
            self.reset_daily()
        elif not self._last_reset_date:
            self._last_reset_date = today

    @property
    def summary(self) -> dict:
        """Current risk state summary."""
        can, reason = self.can_trade()
        return {
            "can_trade": can,
            "deny_reason": reason,
            "daily_pnl": round(self.daily_pnl, 2),
            "total_trades": self.total_trades,
            "total_wins": self.total_wins,
            "win_rate": round(self.total_wins / max(self.total_trades, 1) * 100, 1),
            "consecutive_losses": self.consecutive_losses,
            "circuit_breaker": self._circuit_breaker_active,
            "open_positions": len(self.open_positions),
        }
