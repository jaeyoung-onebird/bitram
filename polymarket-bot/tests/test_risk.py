"""Tests for risk manager."""
import pytest
from src.config import RiskConfig
from src.risk.manager import RiskManager


@pytest.fixture
def risk_cfg() -> RiskConfig:
    return RiskConfig(
        max_daily_loss_usd=20.0,
        max_concurrent_positions=3,
        circuit_breaker_losses=3,
    )


@pytest.fixture
def mgr(risk_cfg: RiskConfig) -> RiskManager:
    return RiskManager(risk_cfg)


class TestCanTrade:
    def test_initial_state_allows(self, mgr: RiskManager):
        allowed, _ = mgr.can_trade()
        assert allowed is True

    def test_daily_loss_limit(self, mgr: RiskManager):
        mgr.record_trade(-10.0)
        mgr.record_trade(-11.0)  # total -21 > -20 limit
        allowed, reason = mgr.can_trade()
        assert allowed is False
        assert "daily loss" in reason

    def test_max_positions(self, mgr: RiskManager):
        mgr.open_positions = [{"id": i} for i in range(3)]
        allowed, reason = mgr.can_trade()
        assert allowed is False
        assert "max positions" in reason


class TestCircuitBreaker:
    def test_triggers_after_n_losses(self, mgr: RiskManager):
        mgr.record_trade(-1.0)
        mgr.record_trade(-1.0)
        mgr.record_trade(-1.0)  # 3 consecutive losses
        allowed, reason = mgr.can_trade()
        assert allowed is False
        assert "circuit breaker" in reason

    def test_win_resets_streak(self, mgr: RiskManager):
        mgr.record_trade(-1.0)
        mgr.record_trade(-1.0)
        mgr.record_trade(5.0)  # win resets streak
        allowed, _ = mgr.can_trade()
        assert allowed is True
        assert mgr.consecutive_losses == 0


class TestResetDaily:
    def test_reset_clears_state(self, mgr: RiskManager):
        mgr.record_trade(-15.0)
        mgr.record_trade(-6.0)  # over limit
        allowed, _ = mgr.can_trade()
        assert allowed is False

        mgr.reset_daily()
        allowed, _ = mgr.can_trade()
        assert allowed is True
        assert mgr.daily_pnl == 0.0
        assert mgr.consecutive_losses == 0

    def test_reset_clears_circuit_breaker(self, mgr: RiskManager):
        for _ in range(3):
            mgr.record_trade(-1.0)
        assert mgr._circuit_breaker_active is True

        mgr.reset_daily()
        assert mgr._circuit_breaker_active is False


class TestSummary:
    def test_summary_format(self, mgr: RiskManager):
        mgr.record_trade(5.0)
        mgr.record_trade(-2.0)
        s = mgr.summary
        assert s["total_trades"] == 2
        assert s["total_wins"] == 1
        assert s["win_rate"] == 50.0
        assert s["daily_pnl"] == 3.0
