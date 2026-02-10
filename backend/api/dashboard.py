"""
Dashboard API: overview stats, portfolio
"""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from db.database import get_db
from db.models import User, Bot, Trade, ExchangeKey
from api.deps import get_current_user
from core.encryption import decrypt_key
from core.upbit_client import UpbitClient

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/overview")
async def dashboard_overview(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """메인 대시보드 데이터"""
    # Bot stats
    stmt = select(Bot).where(Bot.user_id == user.id)
    result = await db.execute(stmt)
    bots = result.scalars().all()

    active_bots = len([b for b in bots if b.status == "running"])
    total_profit = sum(float(b.total_profit or 0) for b in bots)
    total_trades = sum(b.total_trades or 0 for b in bots)
    total_wins = sum(b.win_trades or 0 for b in bots)

    # Recent trades
    stmt = (
        select(Trade)
        .where(Trade.user_id == user.id)
        .order_by(Trade.executed_at.desc())
        .limit(10)
    )
    result = await db.execute(stmt)
    recent_trades = result.scalars().all()

    return {
        "bots": {
            "total": len(bots),
            "active": active_bots,
            "paused": len([b for b in bots if b.status == "paused"]),
            "error": len([b for b in bots if b.status == "error"]),
        },
        "performance": {
            "total_profit": round(total_profit, 0),
            "total_trades": total_trades,
            "win_rate": round(total_wins / total_trades * 100, 1) if total_trades > 0 else 0,
        },
        "recent_trades": [
            {
                "id": str(t.id),
                "side": t.side,
                "pair": t.pair,
                "price": float(t.price),
                "profit": float(t.profit) if t.profit else None,
                "executed_at": str(t.executed_at),
            }
            for t in recent_trades
        ],
        "plan": user.plan,
    }


@router.get("/portfolio")
async def portfolio(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """포트폴리오 현황 (실시간 잔고)"""
    # Get first valid key
    stmt = select(ExchangeKey).where(ExchangeKey.user_id == user.id, ExchangeKey.is_valid == True)
    result = await db.execute(stmt)
    key = result.scalars().first()

    if not key:
        return {"krw": 0, "coins": [], "total_value": 0}

    client = UpbitClient(decrypt_key(key.access_key_enc), decrypt_key(key.secret_key_enc))
    try:
        balance = await client.get_balance()

        # Get current prices for coins
        total_value = balance["krw"]
        enriched_coins = []

        if balance["coins"]:
            markets = [f"KRW-{c['currency']}" for c in balance["coins"]]
            try:
                tickers = await client.get_ticker(markets)
                ticker_map = {t["market"]: t for t in tickers}
            except Exception:
                ticker_map = {}

            for coin in balance["coins"]:
                market = f"KRW-{coin['currency']}"
                ticker = ticker_map.get(market, {})
                current_price = float(ticker.get("trade_price", coin["avg_buy_price"]))
                value = coin["balance"] * current_price
                pnl = (current_price - coin["avg_buy_price"]) * coin["balance"]
                pnl_pct = ((current_price / coin["avg_buy_price"]) - 1) * 100 if coin["avg_buy_price"] > 0 else 0

                enriched_coins.append({
                    "currency": coin["currency"],
                    "balance": coin["balance"],
                    "avg_buy_price": coin["avg_buy_price"],
                    "current_price": current_price,
                    "value": round(value, 0),
                    "pnl": round(pnl, 0),
                    "pnl_pct": round(pnl_pct, 2),
                })
                total_value += value

        return {
            "krw": round(balance["krw"], 0),
            "coins": enriched_coins,
            "total_value": round(total_value, 0),
        }
    except Exception as e:
        return {"error": str(e), "krw": 0, "coins": [], "total_value": 0}
    finally:
        await client.close()
