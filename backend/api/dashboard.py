"""
Dashboard API: overview stats, portfolio, community feed, rankings
"""
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, case, desc

from db.database import get_db
from db.models import User, Bot, Trade, ExchangeKey, Strategy, Post, Follow
from api.deps import get_current_user, get_current_user_optional
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


@router.get("/top-traders")
async def top_traders(
    period: str = Query("week", pattern="^(week|month|all)$"),
    user: User | None = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db),
):
    """이번 주/월 수익 기준 TOP 트레이더"""
    now = datetime.now(timezone.utc)

    # Trade period filter
    trade_filter = True
    if period == "week":
        trade_filter = Trade.executed_at >= now - timedelta(days=7)
    elif period == "month":
        trade_filter = Trade.executed_at >= now - timedelta(days=30)

    stmt = (
        select(
            User.id,
            User.nickname,
            User.plan,
            func.coalesce(func.sum(Trade.profit), 0).label("total_profit"),
            func.count(Trade.id).label("trade_count"),
            func.count(case((Trade.profit > 0, 1))).label("win_count"),
        )
        .join(Trade, Trade.user_id == User.id)
        .where(Trade.side == "sell", trade_filter)
        .group_by(User.id, User.nickname, User.plan)
        .order_by(desc("total_profit"))
        .limit(10)
    )
    result = await db.execute(stmt)
    rows = result.all()

    following_ids: set[str] = set()
    if user and rows:
        ids = [row.id for row in rows]
        f_stmt = select(Follow.following_id).where(Follow.follower_id == user.id, Follow.following_id.in_(ids))
        f_rows = (await db.execute(f_stmt)).all()
        following_ids = {str(r[0]) for r in f_rows}

    return [
        {
            "rank": i + 1,
            "user_id": str(row.id),
            "nickname": row.nickname,
            "plan": row.plan or "free",
            "total_profit": float(row.total_profit),
            "trade_count": row.trade_count,
            "win_rate": round(row.win_count / row.trade_count * 100, 1) if row.trade_count > 0 else 0,
            "is_following": str(row.id) in following_ids if user else False,
        }
        for i, row in enumerate(rows)
    ]


@router.get("/hot-strategies")
async def hot_strategies(
    db: AsyncSession = Depends(get_db),
):
    """최근 복사 수 많은 인기 전략 (공개 전략 중, 실제 데이터(수익 인증 post) 있는 것만)"""
    stmt = (
        select(
            Strategy.id,
            Strategy.name,
            Strategy.pair,
            Strategy.timeframe,
            Strategy.copy_count,
            Strategy.backtest_result,
            User.nickname,
            User.id.label("author_id"),
        )
        .join(User, Strategy.user_id == User.id)
        .where(Strategy.is_public == True, Strategy.copy_count > 0)
        .order_by(Strategy.copy_count.desc())
        .limit(10)
    )
    result = await db.execute(stmt)
    rows = result.all()

    if not rows:
        return []

    strategy_ids = [row.id for row in rows]
    # Only consider posts that have verified_profit (real performance data).
    p_stmt = (
        select(Post.id, Post.strategy_id, Post.verified_profit, Post.created_at)
        .where(Post.strategy_id.in_(strategy_ids), Post.verified_profit.is_not(None))
        .order_by(Post.created_at.desc())
    )
    p_rows = (await db.execute(p_stmt)).all()
    post_by_strategy: dict[str, dict] = {}
    for pid, sid, v, _created in p_rows:
        k = str(sid)
        if k not in post_by_strategy:
            post_by_strategy[k] = {"post_id": str(pid), "verified_profit": v or {}}

    out = []
    for i, row in enumerate(rows):
        post_info = post_by_strategy.get(str(row.id))
        if not post_info:
            # Skip if there is no real-data post to link to.
            continue
        vp = post_info.get("verified_profit") or {}
        return_pct = vp.get("total_return_pct")
        if return_pct is None and row.backtest_result:
            return_pct = row.backtest_result.get("total_return_pct")

        out.append(
            {
                "rank": len(out) + 1,
                "strategy_id": str(row.id),
                "post_id": post_info["post_id"],
                "name": row.name,
                "pair": row.pair,
                "timeframe": row.timeframe,
                "copy_count": row.copy_count or 0,
                "return_pct": return_pct,
                "author": row.nickname,
                "author_id": str(row.author_id),
            }
        )

    return out[:10]


@router.get("/feed")
async def community_feed(
    db: AsyncSession = Depends(get_db),
):
    """최근 커뮤니티 활동 피드"""
    now = datetime.now(timezone.utc)
    three_days_ago = now - timedelta(days=3)

    # Recent posts
    stmt = (
        select(Post, User.nickname)
        .join(User, Post.user_id == User.id)
        .where(Post.created_at >= three_days_ago)
        .order_by(Post.created_at.desc())
        .limit(15)
    )
    result = await db.execute(stmt)
    rows = result.all()

    feed = []
    for post, nickname in rows:
        if post.category == "profit" and post.verified_profit:
            pct = post.verified_profit.get("total_return_pct")
            msg = f"{nickname}님이 {'+' + str(pct) + '%' if pct else ''} 수익을 인증했습니다"
            feed_type = "profit"
        elif post.category == "strategy":
            msg = f"{nickname}님이 전략을 공유했습니다"
            feed_type = "strategy"
        elif post.category == "question":
            msg = f"{nickname}님이 질문을 올렸습니다"
            feed_type = "question"
        else:
            msg = f"{nickname}님이 새 글을 작성했습니다"
            feed_type = "post"

        feed.append({
            "type": feed_type,
            "message": msg,
            "title": post.title,
            "post_id": str(post.id),
            "nickname": nickname,
            "like_count": post.like_count,
            "comment_count": post.comment_count,
            "created_at": str(post.created_at),
        })

    return feed


@router.get("/platform-stats")
async def platform_stats(
    db: AsyncSession = Depends(get_db),
):
    """플랫폼 전체 통계 (비로그인도 가능)"""
    total_users = (await db.execute(select(func.count()).select_from(User))).scalar() or 0
    total_strategies = (await db.execute(
        select(func.count()).select_from(Strategy).where(Strategy.is_public == True)
    )).scalar() or 0
    total_bots = (await db.execute(
        select(func.count()).select_from(Bot).where(Bot.status == "running")
    )).scalar() or 0
    total_trades = (await db.execute(select(func.count()).select_from(Trade))).scalar() or 0

    return {
        "total_users": total_users,
        "total_strategies": total_strategies,
        "active_bots": total_bots,
        "total_trades": total_trades,
    }
