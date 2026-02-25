"""
Data collection and maintenance tasks.
"""
import asyncio
from datetime import datetime, timezone, timedelta
from tasks.celery_app import app
from config import get_settings

settings = get_settings()

# Top KRW markets to collect
TOP_MARKETS = [
    "KRW-BTC", "KRW-ETH", "KRW-XRP", "KRW-SOL", "KRW-DOGE",
    "KRW-ADA", "KRW-AVAX", "KRW-LINK", "KRW-DOT", "KRW-MATIC",
    "KRW-ATOM", "KRW-UNI", "KRW-SUI", "KRW-SEI", "KRW-APT",
    "KRW-NEAR", "KRW-ARB", "KRW-OP", "KRW-SAND", "KRW-MANA",
]


@app.task(name="tasks.data_tasks.collect_ohlcv")
def collect_ohlcv(timeframe: str = "15m"):
    """Collect OHLCV data for top markets."""
    asyncio.run(_collect_ohlcv_async(timeframe))


async def _collect_ohlcv_async(timeframe: str):
    from core.upbit_client import get_public_client
    from db.database import AsyncSessionLocal
    from db.models import OHLCV
    from sqlalchemy.dialects.postgresql import insert
    from decimal import Decimal

    client = get_public_client()

    async with AsyncSessionLocal() as db:
        for market in TOP_MARKETS:
            try:
                candles = await client.fetch_ohlcv(market, timeframe, 5)
                for c in candles:
                    KST = timezone(timedelta(hours=9))
                    stmt = insert(OHLCV).values(
                        time=datetime.fromisoformat(c["time"]).replace(tzinfo=KST),
                        pair=market,
                        timeframe=timeframe,
                        open=Decimal(str(c["open"])),
                        high=Decimal(str(c["high"])),
                        low=Decimal(str(c["low"])),
                        close=Decimal(str(c["close"])),
                        volume=Decimal(str(c["volume"])),
                    ).on_conflict_do_update(
                        index_elements=["time", "pair", "timeframe"],
                        set_={
                            "close": Decimal(str(c["close"])),
                            "high": Decimal(str(c["high"])),
                            "low": Decimal(str(c["low"])),
                            "volume": Decimal(str(c["volume"])),
                        },
                    )
                    await db.execute(stmt)
                await db.commit()
            except Exception as e:
                print(f"Error collecting {market} {timeframe}: {e}")
                continue


@app.task(name="tasks.data_tasks.check_expired_subscriptions")
def check_expired_subscriptions():
    """Check and expire old subscriptions."""
    asyncio.run(_check_subscriptions_async())


async def _check_subscriptions_async():
    from db.database import AsyncSessionLocal
    from db.models import Subscription, User
    from sqlalchemy import select, update

    async with AsyncSessionLocal() as db:
        now = datetime.now(timezone.utc)
        stmt = (
            select(Subscription)
            .where(
                Subscription.status == "active",
                Subscription.plan != "free",
                Subscription.current_period_end < now,
            )
        )
        result = await db.execute(stmt)
        expired = result.scalars().all()

        for sub in expired:
            if sub.status == "cancelled":
                sub.plan = "free"
                sub.status = "expired"
                await db.execute(
                    update(User).where(User.id == sub.user_id).values(plan="free")
                )
            # TODO: Auto-renew for active subscriptions

        await db.commit()
