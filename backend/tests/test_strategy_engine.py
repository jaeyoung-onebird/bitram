import unittest

import pandas as pd

from core.strategy_engine import (
    evaluate_strategy,
    get_available_indicators,
    validate_strategy_config,
)


class StrategyEngineTests(unittest.TestCase):
    def setUp(self):
        self.df = pd.DataFrame(
            {
                "open": [1, 2, 3, 4, 5],
                "high": [1.2, 2.2, 3.2, 4.2, 5.2],
                "low": [0.8, 1.8, 2.8, 3.8, 4.8],
                "close": [1, 2, 3, 4, 5],
                "volume": [100, 110, 120, 130, 140],
            }
        )

    def test_validate_strategy_config_valid(self):
        config = {
            "conditions": [
                {
                    "indicator": "SMA",
                    "params": {"period": 2},
                    "operator": "greater_than",
                    "value": 1,
                }
            ],
            "action": {"type": "market_buy", "amount": 10},
            "safety": {"stop_loss": -5, "take_profit": 10},
        }
        errors = validate_strategy_config(config)
        self.assertEqual(errors, [])

    def test_validate_strategy_config_invalid(self):
        config = {
            "conditions": [
                {
                    "indicator": "UNKNOWN_INDICATOR",
                    "params": {},
                    "operator": "invalid_operator",
                    "value": 10,
                }
            ],
            "action": {"type": "invalid_action", "amount": 0},
            "safety": {"stop_loss": 5, "take_profit": -1},
        }
        errors = validate_strategy_config(config)
        self.assertGreaterEqual(len(errors), 5)

    def test_evaluate_strategy_adds_signal_and_matches_expected(self):
        config = {
            "conditions": [
                {
                    "indicator": "SMA",
                    "params": {"period": 2},
                    "operator": "greater_than",
                    "value": 2.5,
                }
            ],
            "conditions_logic": "AND",
            "action": {"type": "market_buy", "amount": 10},
            "safety": {"stop_loss": -5, "take_profit": 10},
        }
        out = evaluate_strategy(config, self.df)
        self.assertIn("signal", out.columns)
        self.assertEqual(out["signal"].tolist(), [False, False, False, True, True])

    def test_get_available_indicators_contains_sma(self):
        indicators = get_available_indicators()
        names = {item["name"] for item in indicators}
        self.assertIn("SMA", names)


if __name__ == "__main__":
    unittest.main()
