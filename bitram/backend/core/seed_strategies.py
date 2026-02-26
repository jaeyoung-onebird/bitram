"""
Seed sample strategies for new users to explore.
Creates a system user (system@bitram.io) and 8 public strategies.
Idempotent: skips if strategies already exist.
"""
import logging
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from db.database import AsyncSessionLocal
from db.models import User, Strategy

logger = logging.getLogger(__name__)

SYSTEM_EMAIL = "system@bitram.io"
SYSTEM_NICKNAME = "BITRAM"

SAMPLE_STRATEGIES = [
    {
        "name": "골든크로스 (BTC)",
        "description": "SMA 50이 SMA 200을 상향 돌파하면 매수하는 클래식 골든크로스 전략",
        "pair": "KRW-BTC",
        "timeframe": "1d",
        "config_json": {
            "conditions": [
                {
                    "indicator": "SMA",
                    "params": {"period": 50},
                    "operator": "crosses_above",
                    "value": {"indicator": "SMA", "params": {"period": 200}},
                }
            ],
            "conditions_logic": "AND",
            "action": {"type": "market_buy", "amount_type": "percent", "amount": 30},
            "safety": {"stop_loss": -5, "take_profit": 15, "max_position": 50},
        },
    },
    {
        "name": "RSI 과매도 반등 (ETH)",
        "description": "RSI 14가 30 아래에서 올라올 때 매수하는 모멘텀 반전 전략",
        "pair": "KRW-ETH",
        "timeframe": "4h",
        "config_json": {
            "conditions": [
                {
                    "indicator": "RSI",
                    "params": {"period": 14},
                    "operator": "crosses_above",
                    "value": 30,
                }
            ],
            "conditions_logic": "AND",
            "action": {"type": "market_buy", "amount_type": "percent", "amount": 25},
            "safety": {"stop_loss": -4, "take_profit": 10, "max_position": 40},
        },
    },
    {
        "name": "MACD 히스토그램 전환 (BTC)",
        "description": "MACD 히스토그램이 0 위로 전환될 때 매수",
        "pair": "KRW-BTC",
        "timeframe": "1h",
        "config_json": {
            "conditions": [
                {
                    "indicator": "MACD",
                    "params": {"fast": 12, "slow": 26, "signal": 9},
                    "output_key": "histogram",
                    "operator": "crosses_above",
                    "value": 0,
                }
            ],
            "conditions_logic": "AND",
            "action": {"type": "market_buy", "amount_type": "percent", "amount": 20},
            "safety": {"stop_loss": -3, "take_profit": 8, "max_position": 30},
        },
    },
    {
        "name": "볼린저밴드 하단 터치 (XRP)",
        "description": "가격이 볼린저밴드 하단 아래로 갈 때 매수",
        "pair": "KRW-XRP",
        "timeframe": "15m",
        "config_json": {
            "conditions": [
                {
                    "indicator": "Bollinger Bands",
                    "params": {"period": 20, "std_dev": 2},
                    "output_key": "lower",
                    "operator": "greater_than",
                    "value": {"indicator": "EMA", "params": {"period": 1}},
                }
            ],
            "conditions_logic": "AND",
            "action": {"type": "market_buy", "amount_type": "percent", "amount": 15},
            "safety": {"stop_loss": -3, "take_profit": 6, "max_position": 25},
        },
    },
    {
        "name": "스토캐스틱 골든크로스 (SOL)",
        "description": "Stochastic K가 D를 상향 돌파하면서 과매도 영역에서 매수",
        "pair": "KRW-SOL",
        "timeframe": "1h",
        "config_json": {
            "conditions": [
                {
                    "indicator": "Stochastic",
                    "params": {"k_period": 14, "d_period": 3},
                    "output_key": "k",
                    "operator": "crosses_above",
                    "value": {"indicator": "Stochastic", "params": {"k_period": 14, "d_period": 3}, "output_key": "d"},
                },
                {
                    "indicator": "Stochastic",
                    "params": {"k_period": 14, "d_period": 3},
                    "output_key": "k",
                    "operator": "less_than",
                    "value": 30,
                },
            ],
            "conditions_logic": "AND",
            "action": {"type": "market_buy", "amount_type": "percent", "amount": 20},
            "safety": {"stop_loss": -4, "take_profit": 12, "max_position": 35},
        },
    },
    {
        "name": "EMA 트렌드 팔로잉 (BTC)",
        "description": "EMA 9가 EMA 21 위에 있고 RSI가 50 이상일 때 매수",
        "pair": "KRW-BTC",
        "timeframe": "4h",
        "config_json": {
            "conditions": [
                {
                    "indicator": "EMA",
                    "params": {"period": 9},
                    "operator": "greater_than",
                    "value": {"indicator": "EMA", "params": {"period": 21}},
                },
                {
                    "indicator": "RSI",
                    "params": {"period": 14},
                    "operator": "greater_than",
                    "value": 50,
                },
            ],
            "conditions_logic": "AND",
            "action": {"type": "market_buy", "amount_type": "percent", "amount": 25},
            "safety": {"stop_loss": -5, "take_profit": 15, "max_position": 40},
        },
    },
    {
        "name": "CCI 반전 매수 (ETH)",
        "description": "CCI가 -100 아래에서 올라올 때 과매도 반전 매수",
        "pair": "KRW-ETH",
        "timeframe": "1h",
        "config_json": {
            "conditions": [
                {
                    "indicator": "CCI",
                    "params": {"period": 20},
                    "operator": "crosses_above",
                    "value": -100,
                }
            ],
            "conditions_logic": "AND",
            "action": {"type": "market_buy", "amount_type": "percent", "amount": 20},
            "safety": {"stop_loss": -3, "take_profit": 8, "max_position": 30},
        },
    },
    {
        "name": "거래량 급등 + RSI 매수 (BTC)",
        "description": "거래량이 평균의 2배 이상이면서 RSI가 40~60일 때 매수",
        "pair": "KRW-BTC",
        "timeframe": "15m",
        "config_json": {
            "conditions": [
                {
                    "indicator": "Volume Spike",
                    "params": {"period": 20, "threshold": 2.0},
                    "operator": "greater_than",
                    "value": 0,
                },
                {
                    "indicator": "RSI",
                    "params": {"period": 14},
                    "operator": "greater_than",
                    "value": 40,
                },
                {
                    "indicator": "RSI",
                    "params": {"period": 14},
                    "operator": "less_than",
                    "value": 60,
                },
            ],
            "conditions_logic": "AND",
            "action": {"type": "market_buy", "amount_type": "percent", "amount": 15},
            "safety": {"stop_loss": -2, "take_profit": 5, "max_position": 25},
        },
    },
]


async def seed_sample_strategies():
    """Create system user and seed sample strategies. Idempotent."""
    async with AsyncSessionLocal() as db:
        # Check if already seeded
        stmt = select(func.count()).select_from(Strategy).where(Strategy.is_public == True)
        result = await db.execute(stmt)
        count = result.scalar() or 0
        if count >= 8:
            logger.info(f"Seed strategies: already have {count} public strategies, skipping")
            return

        # Get or create system user
        stmt = select(User).where(User.email == SYSTEM_EMAIL)
        result = await db.execute(stmt)
        system_user = result.scalar_one_or_none()

        if not system_user:
            from api.deps import hash_password
            system_user = User(
                email=SYSTEM_EMAIL,
                password_hash=hash_password("bitram-system-2024!"),
                nickname=SYSTEM_NICKNAME,
                plan="admin",
            )
            db.add(system_user)
            await db.flush()
            logger.info("Created system user: system@bitram.io")

        # Insert strategies
        inserted = 0
        for s in SAMPLE_STRATEGIES:
            # Skip if strategy with same name already exists for system user
            stmt = select(Strategy).where(
                Strategy.user_id == system_user.id,
                Strategy.name == s["name"],
            )
            result = await db.execute(stmt)
            if result.scalar_one_or_none():
                continue

            strategy = Strategy(
                user_id=system_user.id,
                name=s["name"],
                description=s["description"],
                pair=s["pair"],
                timeframe=s["timeframe"],
                config_json=s["config_json"],
                is_public=True,
            )
            db.add(strategy)
            inserted += 1

        await db.commit()
        logger.info(f"Seed strategies: inserted {inserted} new strategies")
