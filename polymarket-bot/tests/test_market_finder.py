"""Tests for market finder."""
import json
import pytest
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch
from src.polymarket.market_finder import (
    _parse_slug_timing,
    _parse_market,
    ActiveMarket,
)


class TestParseSlugTiming:
    def test_5min_slug(self):
        start, dur = _parse_slug_timing("btc-updown-5m-1773400800")
        assert start == 1773400800
        assert dur == 300  # 5 minutes

    def test_15min_slug(self):
        start, dur = _parse_slug_timing("eth-updown-15m-1773400800")
        assert start == 1773400800
        assert dur == 900  # 15 minutes

    def test_1h_slug(self):
        start, dur = _parse_slug_timing("btc-updown-1h-1773400800")
        assert start == 1773400800
        assert dur == 3600  # 1 hour

    def test_no_timestamp(self):
        start, dur = _parse_slug_timing("bitcoin-above-72k")
        assert start is None
        assert dur == 0

    def test_no_duration(self):
        start, dur = _parse_slug_timing("some-market-1773400800")
        assert start == 1773400800
        assert dur == 0


class TestParseMarket:
    def _make_market(self, **overrides) -> dict:
        base = {
            "conditionId": "0xabc123",
            "question": "BTC Up or Down 5min",
            "slug": "btc-updown-5m-1773400800",
            "active": True,
            "closed": False,
            "clobTokenIds": json.dumps(["yes_token_123", "no_token_456"]),
            "outcomePrices": json.dumps(["0.55", "0.45"]),
            "minimumTickSize": "0.01",
            "negRisk": False,
        }
        base.update(overrides)
        return base

    def test_valid_market(self):
        m = _make_market_dict(slug="btc-updown-5m-1773400800")
        result = _parse_market(m)
        assert result is not None
        assert result.condition_id == "0xabc123"
        assert result.yes_token_id == "yes_token_123"
        assert result.no_token_id == "no_token_456"
        assert result.yes_price == 0.55
        assert result.no_price == 0.45

    def test_non_btc_market(self):
        m = _make_market_dict(slug="eth-updown-5m-1773400800")
        result = _parse_market(m)
        assert result is None  # only BTC

    def test_non_5m_market(self):
        m = _make_market_dict(slug="btc-updown-1h-1773400800")
        result = _parse_market(m)
        assert result is None  # only 5m

    def test_inactive_market(self):
        m = _make_market_dict(active=False)
        result = _parse_market(m)
        assert result is None

    def test_no_tokens(self):
        m = _make_market_dict(clobTokenIds="[]")
        result = _parse_market(m)
        assert result is None


def _make_market_dict(**overrides) -> dict:
    base = {
        "conditionId": "0xabc123",
        "question": "BTC Up or Down 5min",
        "slug": "btc-updown-5m-1773400800",
        "active": True,
        "closed": False,
        "clobTokenIds": json.dumps(["yes_token_123", "no_token_456"]),
        "outcomePrices": json.dumps(["0.55", "0.45"]),
        "minimumTickSize": "0.01",
        "negRisk": False,
    }
    base.update(overrides)
    return base


class TestActiveMarket:
    def test_is_active(self):
        now = datetime.now(timezone.utc)
        from datetime import timedelta
        m = ActiveMarket(
            condition_id="test",
            yes_token_id="y",
            no_token_id="n",
            question="test",
            slug="btc-updown-5m-0",
            start_time=now - timedelta(seconds=120),
            end_time=now + timedelta(seconds=180),
            tick_size="0.01",
            neg_risk=False,
        )
        assert m.is_active is True
        assert m.seconds_remaining > 0
        assert m.duration_seconds == 300
