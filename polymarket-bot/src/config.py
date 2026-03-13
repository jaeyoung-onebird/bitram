"""Configuration loader — .env + config.yaml merged into typed dataclasses."""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

import yaml
from dotenv import load_dotenv

_PROJECT_ROOT = Path(__file__).resolve().parent.parent


def _load_env() -> None:
    env_path = _PROJECT_ROOT / ".env"
    if env_path.exists():
        load_dotenv(env_path)


def _load_yaml() -> dict:
    yaml_path = _PROJECT_ROOT / "config.yaml"
    if yaml_path.exists():
        with open(yaml_path) as f:
            return yaml.safe_load(f) or {}
    return {}


# ── Typed config sections ────────────────────────────────────────────────


@dataclass(frozen=True)
class CredentialsConfig:
    private_key: str = ""
    safe_address: str = ""
    api_key: str = ""
    api_secret: str = ""
    api_passphrase: str = ""
    signature_type: int = 0
    chain_id: int = 137


@dataclass(frozen=True)
class RiskConfig:
    max_daily_loss_usd: float = 20.0
    max_position_size_usd: float = 30.0
    max_concurrent_positions: int = 3
    min_edge_pct: float = 5.0
    circuit_breaker_losses: int = 3
    min_price: float = 0.85
    max_price: float = 0.97


@dataclass(frozen=True)
class StrategyConfig:
    entry_window_seconds: int = 30
    cancel_window_seconds: int = 5
    target_price_range: tuple[float, float] = (0.90, 0.95)
    order_size_shares: int = 50
    requote_threshold_pct: float = 2.0


@dataclass(frozen=True)
class MonitoringConfig:
    telegram_enabled: bool = False
    telegram_bot_token: str = ""
    telegram_chat_id: str = ""
    log_level: str = "INFO"
    log_file: str = "logs/bot.jsonl"


@dataclass(frozen=True)
class AppConfig:
    credentials: CredentialsConfig = field(default_factory=CredentialsConfig)
    risk: RiskConfig = field(default_factory=RiskConfig)
    strategy: StrategyConfig = field(default_factory=StrategyConfig)
    monitoring: MonitoringConfig = field(default_factory=MonitoringConfig)
    dry_run: bool = True
    http_proxy: str = ""


# ── Loader ───────────────────────────────────────────────────────────────


def load_config(*, dry_run: bool = True) -> AppConfig:
    """Build AppConfig from .env + config.yaml."""
    _load_env()
    y = _load_yaml()

    creds = CredentialsConfig(
        private_key=os.getenv("PRIVATE_KEY", ""),
        safe_address=os.getenv("SAFE_ADDRESS", ""),
        api_key=os.getenv("POLY_API_KEY", ""),
        api_secret=os.getenv("POLY_API_SECRET", ""),
        api_passphrase=os.getenv("POLY_API_PASSPHRASE", ""),
        signature_type=int(os.getenv("SIGNATURE_TYPE", "0")),
        chain_id=int(os.getenv("CHAIN_ID", "137")),
    )

    risk_raw = y.get("risk", {})
    risk = RiskConfig(
        max_daily_loss_usd=risk_raw.get("max_daily_loss_usd", 20.0),
        max_position_size_usd=risk_raw.get("max_position_size_usd", 30.0),
        max_concurrent_positions=risk_raw.get("max_concurrent_positions", 3),
        min_edge_pct=risk_raw.get("min_edge_pct", 5.0),
        circuit_breaker_losses=risk_raw.get("circuit_breaker_losses", 3),
        min_price=risk_raw.get("min_price", 0.85),
        max_price=risk_raw.get("max_price", 0.97),
    )

    strat_raw = y.get("strategy", {})
    price_range = strat_raw.get("target_price_range", [0.90, 0.95])
    strategy = StrategyConfig(
        entry_window_seconds=strat_raw.get("entry_window_seconds", 30),
        cancel_window_seconds=strat_raw.get("cancel_window_seconds", 5),
        target_price_range=(float(price_range[0]), float(price_range[1])),
        order_size_shares=strat_raw.get("order_size_shares", 50),
        requote_threshold_pct=strat_raw.get("requote_threshold_pct", 2.0),
    )

    mon_raw = y.get("monitoring", {})
    monitoring = MonitoringConfig(
        telegram_enabled=mon_raw.get("telegram_enabled", False),
        telegram_bot_token=mon_raw.get("telegram_bot_token", ""),
        telegram_chat_id=mon_raw.get("telegram_chat_id", ""),
        log_level=mon_raw.get("log_level", "INFO"),
        log_file=mon_raw.get("log_file", "logs/bot.jsonl"),
    )

    return AppConfig(
        credentials=creds,
        risk=risk,
        strategy=strategy,
        monitoring=monitoring,
        dry_run=dry_run,
        http_proxy=os.getenv("HTTP_PROXY", ""),
    )
