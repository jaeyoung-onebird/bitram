"""
Database initialization script.
Creates all tables and TimescaleDB hypertable.
Run: python -m db.init_db
"""
import asyncio
from sqlalchemy import text
from db.database import engine, Base
from db.models import *  # noqa: ensure all models are imported


async def init():
    print("Creating database tables...")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        print("Tables created.")

        # Enable TimescaleDB extension
        try:
            await conn.execute(text("CREATE EXTENSION IF NOT EXISTS timescaledb"))
            print("TimescaleDB extension enabled.")
        except Exception as e:
            print(f"TimescaleDB extension note: {e}")

        # Create hypertable for OHLCV
        try:
            await conn.execute(text(
                "SELECT create_hypertable('ohlcv', 'time', if_not_exists => TRUE)"
            ))
            print("OHLCV hypertable created.")
        except Exception as e:
            print(f"Hypertable note: {e}")

    await engine.dispose()
    print("Database initialization complete.")


if __name__ == "__main__":
    asyncio.run(init())
