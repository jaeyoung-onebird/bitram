"""
Polymarket API: bots, markets, trades, positions
Hidden from main UI — accessible only via /pm route.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from uuid import UUID
from decimal import Decimal
from typing import Optional

from db.database import get_db
from db.models import User, PolymarketBot, PolymarketTrade, ExchangeKey
from api.deps import get_current_user
from core.polymarket_client import PolymarketClient
from core.polymarket_bot_manager import start_pm_bot, stop_pm_bot, pause_pm_bot


def _get_readonly_client() -> PolymarketClient:
    """Read-only client for market browsing (no auth needed for Gamma API)."""
    return PolymarketClient()

router = APIRouter(prefix="/api/polymarket", tags=["polymarket"])


# ─── Request/Response Models ─────────────────────────────────────────────

class PMBotCreateRequest(BaseModel):
    name: str
    bot_type: str  # scanner, arbitrage
    exchange_key_id: Optional[str] = None
    config: dict = {}


class PMBotResponse(BaseModel):
    id: str
    name: str
    bot_type: str
    status: str
    config: dict
    current_positions: list
    total_profit_usdc: float
    total_trades: int
    win_trades: int
    win_rate: float
    error_message: Optional[str]
    started_at: Optional[str]
    created_at: str


class PMTradeResponse(BaseModel):
    id: str
    side: str
    market_slug: str
    question: Optional[str] = None
    condition_id: str
    outcome: str
    price: float
    quantity: float
    total_usdc: float
    fee_usdc: float
    profit_usdc: Optional[float]
    profit_pct: Optional[float]
    trigger_reason: Optional[str]
    executed_at: str


class PMKeyRegisterRequest(BaseModel):
    private_key: str
    api_key: str
    api_secret: str
    api_passphrase: str
    label: str = "Polymarket"


# ─── Keys ────────────────────────────────────────────────────────────────

@router.post("/keys")
async def register_pm_key(
    req: PMKeyRegisterRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Register Polymarket API credentials."""
    import json
    from core.encryption import encrypt_key

    key = ExchangeKey(
        user_id=user.id,
        exchange="polymarket",
        label=req.label,
        access_key_enc=encrypt_key(req.private_key),
        secret_key_enc=encrypt_key(json.dumps({
            "api_key": req.api_key,
            "api_secret": req.api_secret,
            "api_passphrase": req.api_passphrase,
        })),
        is_valid=True,
    )
    db.add(key)
    await db.commit()
    await db.refresh(key)
    return {"id": str(key.id), "label": key.label, "exchange": "polymarket"}


@router.get("/keys")
async def list_pm_keys(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(ExchangeKey).where(
        ExchangeKey.user_id == user.id,
        ExchangeKey.exchange == "polymarket",
    )
    result = await db.execute(stmt)
    keys = result.scalars().all()
    return [
        {
            "id": str(k.id),
            "label": k.label,
            "is_valid": k.is_valid,
            "created_at": str(k.created_at),
        }
        for k in keys
    ]


@router.post("/keys/{key_id}/verify")
async def verify_pm_key(
    key_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    import json
    from core.encryption import decrypt_key
    from core.polymarket_client import create_polymarket_client
    from datetime import datetime, timezone

    stmt = select(ExchangeKey).where(
        ExchangeKey.id == UUID(key_id),
        ExchangeKey.user_id == user.id,
        ExchangeKey.exchange == "polymarket",
    )
    result = await db.execute(stmt)
    key = result.scalar_one_or_none()
    if not key:
        raise HTTPException(404, "키를 찾을 수 없습니다.")

    private_key = decrypt_key(key.access_key_enc)
    creds = json.loads(decrypt_key(key.secret_key_enc))

    client = create_polymarket_client(
        private_key, creds["api_key"], creds["api_secret"], creds["api_passphrase"]
    )
    valid = await client.verify_connection()
    await client.close()

    key.is_valid = valid
    key.last_verified_at = datetime.now(timezone.utc)
    await db.commit()

    return {"is_valid": valid}


@router.delete("/keys/{key_id}")
async def delete_pm_key(
    key_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(ExchangeKey).where(
        ExchangeKey.id == UUID(key_id),
        ExchangeKey.user_id == user.id,
        ExchangeKey.exchange == "polymarket",
    )
    result = await db.execute(stmt)
    key = result.scalar_one_or_none()
    if not key:
        raise HTTPException(404, "키를 찾을 수 없습니다.")
    await db.delete(key)
    await db.commit()
    return {"status": "deleted"}


# ─── Markets ─────────────────────────────────────────────────────────────

@router.get("/markets")
async def get_markets(
    search: Optional[str] = None,
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    user: User = Depends(get_current_user),
):
    client = _get_readonly_client()
    if search:
        markets = await client.search_markets(search, limit=limit)
    else:
        markets = await client.get_markets(limit=limit, offset=offset)
    return markets


@router.get("/markets/{condition_id}")
async def get_market_detail(
    condition_id: str,
    user: User = Depends(get_current_user),
):
    client = _get_readonly_client()
    market = await client.get_market(condition_id)
    if not market:
        raise HTTPException(404, "마켓을 찾을 수 없습니다.")
    return market


@router.get("/markets/{condition_id}/orderbook")
async def get_market_orderbook(
    condition_id: str,
    token_id: str,
    user: User = Depends(get_current_user),
):
    client = _get_readonly_client()
    return await client.get_order_book(token_id)


# ─── Bots ────────────────────────────────────────────────────────────────

@router.post("/bots", response_model=PMBotResponse)
async def create_pm_bot(
    req: PMBotCreateRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if req.bot_type not in ("ai", "scanner", "arbitrage"):
        raise HTTPException(400, "bot_type은 'ai', 'scanner' 또는 'arbitrage'여야 합니다.")

    # Default configs
    if not req.config:
        if req.bot_type == "ai":
            req.config = {
                "filters": {"max_expiry_minutes": 0},
                "position_size_usdc": 50,
                "max_open_positions": 10,
                "max_total_usdc": 500,
                "scan_interval_seconds": 120,
            }
        elif req.bot_type == "scanner":
            req.config = {
                "filters": {"min_volume_24h": 10000, "min_liquidity": 5000, "categories": [], "max_expiry_minutes": 0},
                "entry_conditions": {"outcome": "Yes", "max_price": 0.30, "min_price": 0.05},
                "exit_conditions": {"take_profit_price": 0.60, "stop_loss_price": 0.02, "time_exit_hours": 168},
                "position_size_usdc": 50,
                "max_open_positions": 10,
                "scan_interval_seconds": 300,
            }
        else:
            req.config = {
                "min_spread": 0.02,
                "min_volume_24h": 5000,
                "position_size_usdc": 100,
                "max_open_positions": 5,
                "scan_interval_seconds": 60,
            }

    # Auto-assign user's exchange key if not specified
    exchange_key_id = None
    if req.exchange_key_id:
        exchange_key_id = UUID(req.exchange_key_id)
    else:
        # Find user's first valid polymarket key
        key_stmt = select(ExchangeKey).where(
            ExchangeKey.user_id == user.id,
            ExchangeKey.exchange == "polymarket",
            ExchangeKey.is_valid == True,
        ).limit(1)
        key_result = await db.execute(key_stmt)
        auto_key = key_result.scalar_one_or_none()
        if auto_key:
            exchange_key_id = auto_key.id

    bot = PolymarketBot(
        user_id=user.id,
        exchange_key_id=exchange_key_id,
        name=req.name,
        bot_type=req.bot_type,
        config=req.config,
    )
    db.add(bot)
    await db.commit()
    await db.refresh(bot)
    return _bot_response(bot)


@router.get("/bots", response_model=list[PMBotResponse])
async def list_pm_bots(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(PolymarketBot)
        .where(PolymarketBot.user_id == user.id)
        .order_by(PolymarketBot.created_at.desc())
    )
    result = await db.execute(stmt)
    bots = result.scalars().all()
    return [_bot_response(b) for b in bots]


@router.get("/bots/{bot_id}", response_model=PMBotResponse)
async def get_pm_bot(
    bot_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    bot = await _get_user_pm_bot(bot_id, user.id, db)
    return _bot_response(bot)


@router.put("/bots/{bot_id}/config")
async def update_pm_bot_config(
    bot_id: str,
    config: dict,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    bot = await _get_user_pm_bot(bot_id, user.id, db)
    if bot.status == "running":
        raise HTTPException(400, "실행 중인 봇의 설정은 변경할 수 없습니다. 먼저 중지해주세요.")
    bot.config = config
    await db.commit()
    return {"status": "updated"}


@router.post("/bots/{bot_id}/start")
async def start_pm_bot_endpoint(
    bot_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    bot = await _get_user_pm_bot(bot_id, user.id, db)
    if bot.status == "running":
        raise HTTPException(400, "봇이 이미 실행 중입니다.")
    result = await start_pm_bot(bot.id, db)
    if "error" in result:
        raise HTTPException(400, result["error"])
    return result


@router.post("/bots/{bot_id}/stop")
async def stop_pm_bot_endpoint(
    bot_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    bot = await _get_user_pm_bot(bot_id, user.id, db)
    return await stop_pm_bot(bot.id, db)


@router.post("/bots/{bot_id}/pause")
async def pause_pm_bot_endpoint(
    bot_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    bot = await _get_user_pm_bot(bot_id, user.id, db)
    return await pause_pm_bot(bot.id, db)


@router.delete("/bots/{bot_id}")
async def delete_pm_bot(
    bot_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    bot = await _get_user_pm_bot(bot_id, user.id, db)
    if bot.status == "running":
        raise HTTPException(400, "실행 중인 봇은 삭제할 수 없습니다. 먼저 중지해주세요.")
    # 관련 거래 내역 먼저 삭제 (FK 제약)
    from sqlalchemy import delete
    await db.execute(
        delete(PolymarketTrade).where(PolymarketTrade.pm_bot_id == bot.id)
    )
    await db.delete(bot)
    await db.commit()
    return {"status": "deleted"}


@router.get("/bots/{bot_id}/trades", response_model=list[PMTradeResponse])
async def get_pm_bot_trades(
    bot_id: str,
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    bot = await _get_user_pm_bot(bot_id, user.id, db)
    stmt = (
        select(PolymarketTrade)
        .where(PolymarketTrade.pm_bot_id == bot.id)
        .order_by(PolymarketTrade.executed_at.desc())
        .offset((page - 1) * size)
        .limit(size)
    )
    result = await db.execute(stmt)
    trades = result.scalars().all()
    return [_trade_response(t) for t in trades]


# ─── Positions & Stats ───────────────────────────────────────────────────

@router.get("/positions")
async def get_all_positions(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get all open positions across all PM bots."""
    stmt = select(PolymarketBot).where(PolymarketBot.user_id == user.id)
    result = await db.execute(stmt)
    bots = result.scalars().all()

    positions = []
    for bot in bots:
        for pos in (bot.current_positions or []):
            positions.append({**pos, "bot_id": str(bot.id), "bot_name": bot.name})
    return positions


@router.get("/stats")
async def get_pm_stats(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Aggregate P&L stats across all PM bots."""
    stmt = select(PolymarketBot).where(PolymarketBot.user_id == user.id)
    result = await db.execute(stmt)
    bots = result.scalars().all()

    total_profit = sum(float(b.total_profit_usdc or 0) for b in bots)
    total_trades = sum(b.total_trades or 0 for b in bots)
    win_trades = sum(b.win_trades or 0 for b in bots)
    active_bots = sum(1 for b in bots if b.status == "running")
    total_positions = sum(len(b.current_positions or []) for b in bots)

    return {
        "total_profit_usdc": round(total_profit, 2),
        "total_trades": total_trades,
        "win_trades": win_trades,
        "win_rate": round(win_trades / total_trades * 100, 1) if total_trades > 0 else 0,
        "active_bots": active_bots,
        "total_bots": len(bots),
        "total_positions": total_positions,
    }


@router.get("/trades", response_model=list[PMTradeResponse])
async def get_all_trades(
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get all trades across all PM bots."""
    stmt = (
        select(PolymarketTrade)
        .where(PolymarketTrade.user_id == user.id)
        .order_by(PolymarketTrade.executed_at.desc())
        .offset((page - 1) * size)
        .limit(size)
    )
    result = await db.execute(stmt)
    trades = result.scalars().all()
    return [_trade_response(t) for t in trades]


# ─── Arbitrage Preview ───────────────────────────────────────────────────

@router.get("/arbitrage/opportunities")
async def get_arbitrage_opportunities(
    min_spread: float = Query(0.01, ge=0),
    min_volume: float = Query(5000, ge=0),
    user: User = Depends(get_current_user),
):
    from core.polymarket_scanner import find_arbitrage_opportunities
    from config import get_settings

    settings = get_settings()
    client = _get_readonly_client()
    config = {
        "min_spread": min_spread,
        "min_volume_24h": min_volume,
        "fee_rate": settings.POLYMARKET_FEE_RATE,
    }
    return await find_arbitrage_opportunities(client, config)


# ─── Connection Status ───────────────────────────────────────────────────

@router.get("/status")
async def get_pm_status(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Check if user has registered Polymarket API keys."""
    from config import get_settings
    settings = get_settings()

    # Check user's registered keys
    key_stmt = select(ExchangeKey).where(
        ExchangeKey.user_id == user.id,
        ExchangeKey.exchange == "polymarket",
    )
    key_result = await db.execute(key_stmt)
    keys = key_result.scalars().all()
    has_valid_key = any(k.is_valid for k in keys)

    return {
        "connected": has_valid_key,
        "has_api_key": len(keys) > 0,
        "has_valid_key": has_valid_key,
        "paper_trading": settings.POLYMARKET_PAPER_TRADING,
    }


# ─── Market Status (active rounds) ───────────────────────────────────────

@router.get("/market-status")
async def get_market_status(user: User = Depends(get_current_user)):
    """Check if 5-min crypto rounds are currently active."""
    import re
    from datetime import datetime, timezone

    client = _get_readonly_client()
    now = datetime.now(timezone.utc)
    now_epoch = now.timestamp()

    try:
        events = await client.get_events(limit=30, active=True, tag="crypto")
    except Exception:
        return {"active_rounds": 0, "next_round_at": None, "status": "api_error"}

    active_rounds = []
    next_round_epoch = None

    for ev in events:
        for m in ev.get("markets", []):
            slug = m.get("slug", "")
            if "-5m-" not in slug:
                continue
            from core.polymarket_ai_trader import _parse_slug_timing
            start_epoch, dur = _parse_slug_timing(slug)
            if not start_epoch or dur <= 0:
                continue
            end_epoch = start_epoch + dur
            remaining = (end_epoch - now_epoch) / 60
            if 0 < remaining <= dur / 60:
                active_rounds.append({
                    "slug": slug,
                    "question": m.get("question", "")[:80],
                    "remaining_min": round(remaining, 1),
                })
            elif remaining > dur / 60:
                # Future round — track nearest
                if next_round_epoch is None or start_epoch < next_round_epoch:
                    next_round_epoch = start_epoch

    result = {
        "active_rounds": len(active_rounds),
        "rounds": active_rounds[:10],
        "status": "active" if active_rounds else "waiting",
        "now_utc": now.isoformat(),
    }
    if not active_rounds and next_round_epoch:
        next_dt = datetime.fromtimestamp(next_round_epoch, tz=timezone.utc)
        result["next_round_at"] = next_dt.isoformat()
        result["next_round_in_min"] = round((next_round_epoch - now_epoch) / 60, 1)

    return result


# ─── Helpers ─────────────────────────────────────────────────────────────

async def _get_user_pm_bot(bot_id: str, user_id, db: AsyncSession) -> PolymarketBot:
    stmt = select(PolymarketBot).where(
        PolymarketBot.id == UUID(bot_id),
        PolymarketBot.user_id == user_id,
    )
    result = await db.execute(stmt)
    bot = result.scalar_one_or_none()
    if not bot:
        raise HTTPException(404, "봇을 찾을 수 없습니다.")
    return bot


def _bot_response(bot: PolymarketBot) -> PMBotResponse:
    total = bot.total_trades or 0
    wins = bot.win_trades or 0
    return PMBotResponse(
        id=str(bot.id),
        name=bot.name,
        bot_type=bot.bot_type,
        status=bot.status,
        config=bot.config or {},
        current_positions=bot.current_positions or [],
        total_profit_usdc=float(bot.total_profit_usdc or 0),
        total_trades=total,
        win_trades=wins,
        win_rate=round(wins / total * 100, 1) if total > 0 else 0,
        error_message=bot.error_message,
        started_at=str(bot.started_at) if bot.started_at else None,
        created_at=str(bot.created_at),
    )


def _trade_response(t: PolymarketTrade) -> PMTradeResponse:
    return PMTradeResponse(
        id=str(t.id),
        side=t.side,
        market_slug=t.market_slug,
        question=t.question,
        condition_id=t.condition_id,
        outcome=t.outcome,
        price=float(t.price),
        quantity=float(t.quantity),
        total_usdc=float(t.total_usdc),
        fee_usdc=float(t.fee_usdc or 0),
        profit_usdc=float(t.profit_usdc) if t.profit_usdc else None,
        profit_pct=t.profit_pct,
        trigger_reason=t.trigger_reason,
        executed_at=str(t.executed_at),
    )


# ─── AI Analysis (Full-Market Scanner + Claude) ─────────────────────────

@router.post("/ai/scan")
async def run_ai_scan(
    user: User = Depends(get_current_user),
):
    """Run full-market AI scan — returns candidates with Claude analysis."""
    import httpx
    from datetime import datetime, timezone

    client = _get_readonly_client()
    candidates = []

    try:
        async with httpx.AsyncClient(timeout=20.0) as http:
            for offset in range(0, 200, 50):
                resp = await http.get(
                    "https://gamma-api.polymarket.com/events",
                    params={
                        "active": "true",
                        "closed": "false",
                        "limit": 50,
                        "offset": offset,
                        "order": "volume24hr",
                        "ascending": "false",
                    },
                )
                resp.raise_for_status()
                events = resp.json()
                if not events:
                    break
                for ev in events:
                    for m in ev.get("markets", []):
                        if m.get("active") and not m.get("closed"):
                            parsed = _parse_ai_candidate(m)
                            if parsed:
                                candidates.append(parsed)
    except Exception as e:
        raise HTTPException(500, f"Scan failed: {e}")

    # Sort by volume descending, limit to 50
    candidates.sort(key=lambda c: c.get("volume_24h", 0), reverse=True)
    return candidates[:50]


@router.post("/ai/analyze")
async def run_ai_analyze(
    condition_id: str,
    question: str,
    description: str = "",
    yes_price: float = 0.5,
    no_price: float = 0.5,
    category: str = "other",
    end_date: str = "",
    user: User = Depends(get_current_user),
):
    """Run Claude AI probability estimation on a single market."""
    import os
    import httpx

    api_key = os.getenv("ANTHROPIC_API_KEY", "")
    if not api_key:
        raise HTTPException(400, "ANTHROPIC_API_KEY not configured on server")

    system_prompt = """You are a calibrated probability forecaster for prediction markets.
Output ONLY a JSON object with: probability (0.01-0.99), confidence (0.1-1.0), reasoning (3-5 sentences), key_factors (list), risks (list).
Form your own INDEPENDENT estimate first. Do NOT anchor on the market price."""

    user_prompt = f"""Analyze this prediction market:
Question: {question}
Description: {description[:500]}
Current prices: YES=${yes_price:.2f}, NO=${no_price:.2f}
Market-implied probability: {yes_price*100:.1f}%
Category: {category}
Resolution date: {end_date}

Research thoroughly and provide your probability estimate."""

    try:
        async with httpx.AsyncClient(timeout=60.0) as http:
            body = {
                "model": "claude-sonnet-4-20250514",
                "max_tokens": 1000,
                "system": system_prompt,
                "messages": [{"role": "user", "content": user_prompt}],
                "tools": [{
                    "type": "web_search_20250305",
                    "name": "web_search",
                    "max_uses": 3,
                }],
            }
            resp = await http.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": api_key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json=body,
            )
            resp.raise_for_status()
            data = resp.json()
    except Exception as e:
        raise HTTPException(500, f"Claude API error: {e}")

    # Parse response
    raw_text = ""
    for block in data.get("content", []):
        if block.get("type") == "text":
            raw_text += block["text"]

    import json as json_mod
    try:
        text = raw_text.strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[1].rsplit("```", 1)[0]
        result = json_mod.loads(text)
    except Exception:
        return {
            "error": "parse_error",
            "raw_response": raw_text[:500],
        }

    probability = max(0.01, min(0.99, float(result.get("probability", 0.5))))
    confidence = max(0.1, min(1.0, float(result.get("confidence", 0.5))))

    # Calculate edge
    if probability > yes_price:
        edge = probability - yes_price
        side = "YES"
    elif probability < yes_price:
        edge = yes_price - probability
        side = "NO"
    else:
        edge = 0.0
        side = "SKIP"

    if edge < 0.10 or confidence < 0.6:
        side = "SKIP"

    # Kelly sizing
    kelly = 0.0
    if side != "SKIP":
        p = probability if side == "YES" else (1 - probability)
        market_price = yes_price if side == "YES" else no_price
        b = (1 - market_price) / market_price if market_price > 0 else 0
        if b > 0:
            kelly = max(0, (p * b - (1 - p)) / b * 0.5)

    return {
        "condition_id": condition_id,
        "question": question,
        "category": category,
        "market_yes_price": yes_price,
        "probability": probability,
        "confidence": confidence,
        "edge": round(edge, 4),
        "edge_pct": round(edge * 100, 1),
        "recommended_side": side,
        "kelly_fraction": round(kelly, 4),
        "reasoning": result.get("reasoning", ""),
        "key_factors": result.get("key_factors", []),
        "risks": result.get("risks", []),
    }


@router.get("/ai/logs")
async def get_ai_analysis_logs(
    limit: int = Query(50, ge=1, le=200),
    user: User = Depends(get_current_user),
):
    """Get recent AI analysis log entries from analysis.jsonl."""
    import json as json_mod
    from pathlib import Path

    log_path = Path("logs/pm_analysis.jsonl")
    if not log_path.exists():
        return []

    entries = []
    try:
        lines = log_path.read_text(encoding="utf-8").strip().split("\n")
        for line in reversed(lines):
            if not line.strip():
                continue
            try:
                entries.append(json_mod.loads(line))
            except Exception:
                continue
            if len(entries) >= limit:
                break
    except Exception:
        pass

    return entries


@router.get("/ai/accuracy")
async def get_ai_accuracy(
    user: User = Depends(get_current_user),
):
    """Get AI prediction accuracy stats from logged analysis."""
    import json as json_mod
    import math
    from pathlib import Path
    from collections import defaultdict

    log_path = Path("logs/pm_analysis.jsonl")
    if not log_path.exists():
        return {"total": 0, "resolved": 0, "message": "No analysis logs yet"}

    entries = []
    try:
        for line in log_path.read_text(encoding="utf-8").strip().split("\n"):
            if line.strip():
                entries.append(json_mod.loads(line))
    except Exception:
        return {"total": 0, "error": "Failed to read logs"}

    resolved = [e for e in entries if "resolved_outcome" in e]
    traded = [e for e in entries if e.get("recommended_side") in ("YES", "NO")]
    skipped = [e for e in entries if e.get("recommended_side") == "SKIP"]

    # Category breakdown
    cat_counts = defaultdict(int)
    for e in entries:
        cat_counts[e.get("category", "unknown")] += 1

    # Accuracy for resolved
    correct = 0
    brier_sum = 0.0
    for e in resolved:
        outcome = float(e["resolved_outcome"])
        prob = max(0.01, min(0.99, float(e.get("claude_probability", 0.5))))
        brier_sum += (prob - outcome) ** 2
        if (prob > 0.5) == (outcome > 0.5):
            correct += 1

    n = len(resolved) or 1

    return {
        "total": len(entries),
        "resolved": len(resolved),
        "traded": len(traded),
        "skipped": len(skipped),
        "pending": len(entries) - len(resolved),
        "accuracy": round(correct / n, 4) if resolved else None,
        "brier_score": round(brier_sum / n, 4) if resolved else None,
        "categories": dict(cat_counts),
    }


def _parse_ai_candidate(m: dict) -> dict | None:
    """Parse a raw Gamma market into an AI candidate dict."""
    import json as json_mod

    prices = m.get("outcomePrices", [])
    if isinstance(prices, str):
        prices = json_mod.loads(prices)
    if not prices or len(prices) < 2:
        return None

    yes_price = float(prices[0])
    no_price = float(prices[1])

    # Filter: skip extreme probabilities
    if yes_price < 0.10 or yes_price > 0.90:
        return None

    volume = float(m.get("volume24hr", 0) or m.get("volume", 0) or 0)
    if volume < 1000:
        return None

    liquidity = float(m.get("liquidityNum", 0) or 0)
    if liquidity < 5000:
        return None

    spread = abs(yes_price - (1 - no_price))
    if spread > 0.10:
        return None

    tokens = m.get("clobTokenIds", [])
    if isinstance(tokens, str):
        tokens = json_mod.loads(tokens)
    if not tokens or len(tokens) < 2:
        return None

    end_date = m.get("endDate", "")

    # Category detection
    question = m.get("question", "")
    description = m.get("description", "")
    category = _detect_category(question, description)

    return {
        "condition_id": m.get("conditionId", m.get("condition_id", "")),
        "question": question,
        "description": description[:300],
        "category": category,
        "yes_price": yes_price,
        "no_price": no_price,
        "spread": round(spread, 4),
        "volume_24h": round(volume),
        "liquidity": round(liquidity),
        "end_date": end_date,
        "slug": m.get("slug", ""),
        "yes_token_id": tokens[0],
        "no_token_id": tokens[1],
    }


def _detect_category(question: str, description: str) -> str:
    text = (question + " " + description).lower()
    if any(w in text for w in ["bitcoin", "btc", "ethereum", "eth", "crypto", "solana", "sol", "token", "defi"]):
        return "crypto"
    if any(w in text for w in ["president", "election", "congress", "senate", "trump", "biden", "democrat", "republican", "vote"]):
        return "politics"
    if any(w in text for w in ["nfl", "nba", "mlb", "ufc", "fifa", "premier league", "champions", "game", "match", "win"]):
        return "sports"
    if any(w in text for w in ["fed", "interest rate", "gdp", "inflation", "cpi", "recession", "treasury"]):
        return "macro"
    if any(w in text for w in ["oscar", "grammy", "movie", "album", "box office", "netflix"]):
        return "culture"
    return "other"


# ─── Relayer API ────────────────────────────────────────────────────────

@router.get("/relayer/transactions")
async def get_relayer_transactions(user: User = Depends(get_current_user)):
    """Get recent Relayer transactions (gasless on-chain txns)."""
    client = _get_readonly_client()
    try:
        txns = await client.relayer_get_transactions()
        return txns
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        await client.close()
