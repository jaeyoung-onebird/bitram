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
    "1m": 200,
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

    # Fetch historical data (fetch_ohlcv handles pagination internally)
    client = get_public_client()
    candle_count = PERIOD_CANDLE_MAP.get(req.period, 600)
    all_candles = await client.fetch_ohlcv(strategy.pair, strategy.timeframe, candle_count)

    if not all_candles or len(all_candles) < 20:
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

    # Award backtest points
    try:
        from core.points import award_points
        await award_points(db, user.id, "first_backtest", "첫 백테스트 실행")
        await award_points(db, user.id, "backtest_run", "백테스트 실행")
    except Exception:
        pass

    await db.commit()

    return result_dict
