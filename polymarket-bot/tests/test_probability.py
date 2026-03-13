"""Tests for probability estimation engine."""
import pytest
from src.strategy.probability import estimate_probability, calc_edge


class TestEstimateProbability:
    """Core probability estimation tests."""

    def test_t10_price_above_reference(self):
        """T-10s, BTC 0.05% above reference → Up probability > 85%."""
        ref = 70000.0
        current = ref * 1.0005  # +0.05%
        result = estimate_probability(ref, current, seconds_remaining=10)
        assert result.up_probability > 0.85, f"Expected >85%, got {result.up_probability:.2%}"

    def test_t30_flat_price(self):
        """T-30s, no price change → probability ≈ 50%."""
        ref = 70000.0
        result = estimate_probability(ref, ref, seconds_remaining=30)
        assert 0.40 <= result.up_probability <= 0.60, f"Expected ~50%, got {result.up_probability:.2%}"

    def test_t5_price_below_reference(self):
        """T-5s, BTC 0.1% below reference → Down probability > 90%."""
        ref = 70000.0
        current = ref * 0.999  # -0.1%
        result = estimate_probability(ref, current, seconds_remaining=5)
        assert result.down_probability > 0.90, f"Expected Down >90%, got {result.down_probability:.2%}"

    def test_symmetry(self):
        """Equal distance above/below should give symmetric probabilities."""
        ref = 70000.0
        above = estimate_probability(ref, ref * 1.001, seconds_remaining=20)
        below = estimate_probability(ref, ref * 0.999, seconds_remaining=20)
        # up_probability(above) should roughly equal down_probability(below)
        diff = abs(above.up_probability - below.down_probability)
        assert diff < 0.05, f"Asymmetry: above.up={above.up_probability:.3f}, below.down={below.down_probability:.3f}"

    def test_time_decay_increases_certainty(self):
        """Less time remaining → more extreme probabilities."""
        ref = 70000.0
        current = ref * 1.0001  # very slightly above (avoids cap at 0.99)

        prob_120s = estimate_probability(ref, current, seconds_remaining=120, volatility_60s_pct=0.03)
        prob_30s = estimate_probability(ref, current, seconds_remaining=30, volatility_60s_pct=0.03)
        prob_10s = estimate_probability(ref, current, seconds_remaining=10, volatility_60s_pct=0.03)

        assert prob_10s.up_probability > prob_30s.up_probability
        assert prob_30s.up_probability > prob_120s.up_probability

    def test_momentum_boost(self):
        """Positive momentum should boost Up probability."""
        ref = 70000.0
        current = ref * 1.0001  # tiny edge so momentum matters

        no_momentum = estimate_probability(ref, current, 60, momentum_10s_pct=0, volatility_60s_pct=0.03)
        up_momentum = estimate_probability(ref, current, 60, momentum_10s_pct=0.05, volatility_60s_pct=0.03)

        assert up_momentum.up_probability > no_momentum.up_probability

    def test_momentum_contrary(self):
        """Contrary momentum should reduce probability."""
        ref = 70000.0
        current = ref * 1.0003  # above reference

        no_momentum = estimate_probability(ref, current, 20, momentum_10s_pct=0)
        down_momentum = estimate_probability(ref, current, 20, momentum_10s_pct=-0.05)

        assert down_momentum.up_probability < no_momentum.up_probability

    def test_bounds(self):
        """Probability should always be in [0.01, 0.99]."""
        ref = 70000.0
        extreme_up = estimate_probability(ref, ref * 1.01, seconds_remaining=3)
        extreme_down = estimate_probability(ref, ref * 0.99, seconds_remaining=3)

        assert 0.01 <= extreme_up.up_probability <= 0.99
        assert 0.01 <= extreme_down.up_probability <= 0.99

    def test_zero_reference_price(self):
        """Zero reference price should return 50/50."""
        result = estimate_probability(0, 70000, seconds_remaining=30)
        assert result.up_probability == 0.5


class TestCalcEdge:
    def test_positive_edge(self):
        """Our estimate higher than market → positive edge."""
        edge = calc_edge(0.90, 0.85)
        assert edge == pytest.approx(0.05, abs=0.001)

    def test_negative_edge(self):
        """Market price higher than our estimate → negative edge."""
        edge = calc_edge(0.70, 0.85)
        assert edge == pytest.approx(-0.15, abs=0.001)

    def test_no_edge(self):
        edge = calc_edge(0.50, 0.50)
        assert edge == pytest.approx(0.0, abs=0.001)
