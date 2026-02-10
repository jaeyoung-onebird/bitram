"""
BITRAM - Main Application
"""
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import get_settings
from db.database import engine, Base

# Import all routers
from api.auth import router as auth_router
from api.keys import router as keys_router
from api.strategies import router as strategies_router
from api.backtest import router as backtest_router
from api.bots import router as bots_router
from api.posts import router as posts_router
from api.dashboard import router as dashboard_router
from api.ws import router as ws_router
from api.telegram import router as telegram_router

settings = get_settings()
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: create tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        try:
            await conn.execute(
                "SELECT create_hypertable('ohlcv', 'time', if_not_exists => TRUE)"
            )
        except Exception:
            pass

    # Start Telegram bot polling
    if settings.TELEGRAM_BOT_TOKEN:
        try:
            from telegram.ext import Application, CommandHandler, CallbackQueryHandler
            from telegram_module.bot import (
                cmd_start, cmd_status, cmd_bots, cmd_profit,
                cmd_trades, cmd_balance, cmd_connect, cmd_help,
                callback_handler,
            )

            tg_app = Application.builder().token(settings.TELEGRAM_BOT_TOKEN).build()
            tg_app.add_handler(CommandHandler("start", cmd_start))
            tg_app.add_handler(CommandHandler("status", cmd_status))
            tg_app.add_handler(CommandHandler("bots", cmd_bots))
            tg_app.add_handler(CommandHandler("profit", cmd_profit))
            tg_app.add_handler(CommandHandler("trades", cmd_trades))
            tg_app.add_handler(CommandHandler("balance", cmd_balance))
            tg_app.add_handler(CommandHandler("connect", cmd_connect))
            tg_app.add_handler(CommandHandler("help", cmd_help))
            tg_app.add_handler(CallbackQueryHandler(callback_handler))

            await tg_app.initialize()
            await tg_app.start()
            await tg_app.updater.start_polling()
            logger.info("Telegram bot started polling")
            app.state.tg_app = tg_app
        except Exception as e:
            logger.error(f"Failed to start Telegram bot: {e}")

    yield

    # Shutdown Telegram bot
    if hasattr(app.state, "tg_app"):
        try:
            tg_app = app.state.tg_app
            await tg_app.updater.stop()
            await tg_app.stop()
            await tg_app.shutdown()
            logger.info("Telegram bot stopped")
        except Exception as e:
            logger.error(f"Error stopping Telegram bot: {e}")

    await engine.dispose()


app = FastAPI(
    title="BITRAM",
    description="업비트 전용 노코드 자동매매 봇 빌더 API",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS
origins = settings.CORS_ORIGINS.split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(auth_router)
app.include_router(keys_router)
app.include_router(strategies_router)
app.include_router(backtest_router)
app.include_router(bots_router)
app.include_router(posts_router)
app.include_router(dashboard_router)
app.include_router(ws_router)
app.include_router(telegram_router)


@app.get("/")
async def root():
    return {"service": "BITRAM", "version": "1.0.0", "status": "running"}


@app.get("/health")
async def health():
    return {"status": "ok"}
