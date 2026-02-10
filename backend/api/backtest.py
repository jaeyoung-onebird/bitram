"""
Backtest API: run backtests on strategies
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from uuid import UUID
import pandas as pd

from db.database import get_db
from db.models import User, Strategy
from api.deps import get_current_user
from core.backtester import run_backtest
from core.upbit_client import get_public_client

router = APIRouter(prefix="/api/strategies", tags=["backtest"])


class BacktestRequest(BaseModel):
    period: str = "3m"  # 1m, 3m, 6m, 1y, all
    initial_capital: float = 10_000_000


PERIOD_CANDLE_MAP = {
    "1m": 200,     # ~1 month of 15m candles
    "3m": 600,
    "6m": 1200,
    "1y": 2000,
    "all": 2000,
}


@router.post("/{strategy_id}/backtest")
async def run_strategy_backtest(
    strategy_id: str,
    req: BacktestRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Load strategy
    stmt = select(Strategy).where(Strategy.id == UUID(strategy_id), Strategy.user_id == user.id)
    result = await db.execute(stmt)
    strategy = result.scalar_one_or_none()
    if not strategy:
        raise HTTPException(404, "전략을 찾을 수 없습니다.")

    # Fetch historical data
    client = get_public_client()
    candle_count = PERIOD_CANDLE_MAP.get(req.period, 600)

    all_candles = []
    to_param = None

    # Fetch in batches of 200
    while len(all_candles) < candle_count:
        batch_size = min(200, candle_count - len(all_candles))
        candles = await client.fetch_ohlcv(strategy.pair, strategy.timeframe, batch_size)
        if not candles:
            break

        if to_param is None:
            all_candles = candles
        else:
            all_candles = candles + all_candles

        if len(candles) < batch_size:
            break

        # Set 'to' param for next batch
        to_param = candles[0]["time"]

    if len(all_candles) < 20:
        raise HTTPException(400, "백테스팅에 충분한 데이터가 없습니다.")

    df = pd.DataFrame(all_candles)

    # Run backtest
    bt_result = run_backtest(
        df=df,
        strategy_config=strategy.config_json,
        initial_capital=req.initial_capital,
    )

    # Save result
    result_dict = bt_result.to_dict()
    strategy.backtest_result = result_dict
    await db.commit()

    return result_dict
