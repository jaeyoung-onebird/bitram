"""
Anonymous real-time chat room for all BITRAM users.
Single room, WebSocket-based with Redis for message persistence.
Each connection gets a random anonymous nickname (e.g. 익명_A3F2).
Includes an AI bot ("비트램AI") that naturally joins conversations
with real-time Upbit price context.
"""
import asyncio
import json
import time
import logging
import secrets
import random
import httpx
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from core.redis_cache import get_redis
from core.sanitizer import sanitize_text
from api.deps import decode_token
from config import get_settings

logger = logging.getLogger(__name__)
router = APIRouter(tags=["chat"])

REDIS_KEY = "chat:general:messages"
MAX_MESSAGES = 300
MAX_MESSAGE_LENGTH = 500

ANON_EMOJIS = [
    "🐶", "🐱", "🐰", "🦊", "🐻", "🐼", "🐨", "🐯",
    "🦁", "🐸", "🐵", "🐧", "🐥", "🦄", "🐙", "🦋",
    "🐳", "🐬", "🦈", "🦉", "🐺", "🦝", "🐮", "🐷",
    "🌸", "🌻", "🍀", "⭐", "🌙", "🔥", "💎", "🎯",
    "🎲", "🎮", "🎸", "🎨", "🚀", "⚡", "🍕", "🍩",
]

# In-memory connections (per worker process)
_connections: dict[str, WebSocket] = {}  # user_id -> ws

# ─── AI Bot Constants ─────────────────────────────────────────────────────────
BOT_ANON_ID = "BITRAM_AI"
BOT_NICKNAME = "비트램AI"
BOT_EMOJI = "🤖"

# Direct mention triggers — always respond immediately
BOT_DIRECT_TRIGGERS = ["비트램", "@비트램", "bitram"]

# Command triggers
BOT_COMMANDS = ["/brief", "/summary", "/rules"]

# Message counter for periodic "join" checks
_msg_counter = 0
_bot_last_response = 0.0  # cooldown tracker
_last_briefing_time = 0.0  # auto-briefing tracker
BRIEFING_INTERVAL = 1800  # 30 minutes

# Price cache
_price_cache: dict = {}
_price_cache_time = 0.0
PRICE_CACHE_TTL = 30  # seconds

PRICE_MARKETS = [
    "KRW-BTC", "KRW-ETH", "KRW-XRP", "KRW-SOL",
    "KRW-DOGE", "KRW-ADA", "KRW-AVAX", "KRW-DOT",
]

# ─── System Prompts ───────────────────────────────────────────────────────────

BOT_SYSTEM_PROMPT = (
    "당신은 비트램(BITRAM) 커뮤니티의 AI 트레이더 '비트램AI'입니다.\n\n"
    "## 정체성\n"
    "- 코인판 10년 경력의 현직 트레이더 느낌\n"
    "- 친구한테 카톡 보내듯 짧고 직설적으로 말함\n"
    "- 커뮤니티 분위기를 살려주는 역할\n\n"
    "## 말투 규칙\n"
    "- 존댓말 NO → 반말/친근한 말투\n"
    "- 줄바꿈 자주, 짧게 끊어서\n"
    "- 이모지 1~2개 적당히\n"
    "- '리스크 관리' '신중한 투자' 같은 교과서 멘트 절대 금지\n"
    "- 대신 구체적인 가격, 지지/저항선, 퍼센트로 말함\n\n"
    "## 답변 스타일 예시\n\n"
    "❌ 나쁜 예:\n"
    "'투자 결정을 내리는 것은 매우 신중해야 하는 과정입니다.\n"
    "리스크 관리와 장기적인 전략을 수립하는 것이 중요합니다.'\n\n"
    "✅ 좋은 예:\n"
    "'리플 지금 2,052원인데\n"
    "2,000원 깨지면 1,900원까지 열려있음\n"
    "버티면 2,200 노려볼 수 있는데\n"
    "BTC 흐름이랑 같이 봐야 해'\n\n"
    "## 현재 시세 컨텍스트 (실시간)\n"
    "{CURRENT_PRICES}\n\n"
    "## 상황별 대응\n\n"
    "**코인 추천 요청할 때**\n"
    "→ '추천은 못 해주는데' 같은 말 하지 말고\n"
    "→ 현재 시세 기준으로 기술적 분석 바로 던져줌\n\n"
    "**상승/하락 예측 요청**\n"
    "→ 확률과 조건으로 답함\n"
    "→ 'BTC 96,500 지키면 반등 가능성 높음. 못 지키면 95,000까지 열려'\n\n"
    "**잡담/인사**\n"
    "→ 짧게 받아치고 시장 얘기로 자연스럽게 연결\n"
    "→ 예: 'ㅋㅋ 나도 이 장 뭔지 모르겠음. 근데 BTC 97만 지지선이 관건이야'\n\n"
    "## 절대 하지 말 것\n"
    "- '투자에 신중하세요' 류의 멘트\n"
    "- 3줄 넘는 교과서식 설명\n"
    "- 영어 위주 전문용어 나열\n"
    "- 질문을 질문으로만 되받기\n"
    "- '참고용이며 투자 판단은 본인 책임입니다' 같은 면책 문구\n\n"
    "## 비트램 플랫폼 (질문 올 때만)\n"
    "- 전략 빌더: 코딩 없이 GUI로 매수/매도 조건 설정\n"
    "- 백테스트: 과거 데이터로 전략 검증\n"
    "- 자동매매 봇: 업비트 연결 24시간 자동매매\n"
    "- 마켓플레이스: 전략 공유/복사"
)

BOT_JUDGE_PROMPT = (
    "너는 비트램AI — 코인 커뮤니티 채팅방의 AI 트레이더야.\n"
    "아래 최근 대화를 보고 끼어들지 말지 판단해.\n\n"
    "끼어들어야 할 때:\n"
    "- 코인/차트/시세 관련 질문에 아무도 대답 안 했을 때\n"
    "- 틀린 정보 돌아다닐 때\n"
    "- 시세 언급 나왔는데 보충할 게 있을 때\n\n"
    "가만히 있어야 할 때:\n"
    "- 유저끼리 잘 떠들고 있을 때\n"
    "- 방금 비트램AI가 말했을 때\n"
    "- 단순 인사/이모지/ㅋㅋ 수준일 때\n\n"
    "## 현재 시세\n{CURRENT_PRICES}\n\n"
    "첫 줄에 YES 또는 NO만 써.\n"
    "YES면 두번째 줄부터 반말로 짧게 답변 (2~3줄).\n"
    "NO면 NO만 쓰고 끝."
)

BOT_RULES_TEXT = (
    "📋 비트램 채팅방 규칙\n\n"
    "1. 서로 존중하기 — 비방/욕설 금지\n"
    "2. 사기/스캠 홍보 금지\n"
    "3. 도배/스팸 금지\n"
    "4. 개인정보 공유 주의\n"
    "5. 코인 관련 자유롭게 토론 OK\n\n"
    "궁금한 거 있으면 @비트램 으로 물어봐 👋"
)


def _generate_anon_id() -> str:
    return secrets.token_hex(2).upper()


def _pick_emoji() -> str:
    return random.choice(ANON_EMOJIS)


def _is_direct_mention(content: str) -> bool:
    """Check if the message directly mentions the bot."""
    lower = content.lower()
    return any(t in lower for t in BOT_DIRECT_TRIGGERS)


def _is_command(content: str) -> str | None:
    """Check if message is a bot command. Returns command or None."""
    stripped = content.strip().lower()
    for cmd in BOT_COMMANDS:
        if stripped == cmd or stripped.startswith(cmd + " "):
            return cmd
    return None


# ─── Real-time Price Fetching ─────────────────────────────────────────────────

async def _fetch_prices() -> dict:
    """Fetch current prices from Upbit. Cached for PRICE_CACHE_TTL seconds."""
    global _price_cache, _price_cache_time
    now = time.time()
    if _price_cache and (now - _price_cache_time < PRICE_CACHE_TTL):
        return _price_cache

    try:
        from core.upbit_client import get_public_client
        client = get_public_client()
        tickers = await client.get_ticker(PRICE_MARKETS)
        result = {}
        for t in tickers:
            symbol = str(t.get("market", "")).replace("KRW-", "")
            result[symbol] = {
                "price": float(t.get("trade_price", 0) or 0),
                "change_pct": round(float(t.get("signed_change_rate", 0) or 0) * 100, 2),
                "change": t.get("change", ""),  # RISE, FALL, EVEN
            }
        _price_cache = result
        _price_cache_time = now
        return result
    except Exception as e:
        logger.warning(f"Price fetch error: {e}")
        return _price_cache or {}


def _format_price(price: float) -> str:
    """Format price with commas. e.g. 142350000 → '142,350,000'"""
    if price >= 1000:
        return f"{int(price):,}"
    return f"{price:,.2f}"


def _build_price_context(prices: dict) -> str:
    """Build price string for system prompt injection."""
    if not prices:
        return "(시세 데이터 없음)"
    lines = []
    for symbol in ["BTC", "ETH", "XRP", "SOL", "DOGE", "ADA", "AVAX", "DOT"]:
        p = prices.get(symbol)
        if not p:
            continue
        sign = "+" if p["change_pct"] >= 0 else ""
        lines.append(f"{symbol} {_format_price(p['price'])}원 ({sign}{p['change_pct']}%)")
    return " | ".join(lines)


def _get_system_prompt(prices: dict) -> str:
    """Build the full system prompt with live prices injected."""
    price_ctx = _build_price_context(prices)
    return BOT_SYSTEM_PROMPT.replace("{CURRENT_PRICES}", price_ctx)


def _get_judge_prompt(prices: dict) -> str:
    """Build the judge prompt with live prices injected."""
    price_ctx = _build_price_context(prices)
    return BOT_JUDGE_PROMPT.replace("{CURRENT_PRICES}", price_ctx)


# ─── AI Bot Logic ─────────────────────────────────────────────────────────────

async def _ai_respond_direct(user_content: str, redis):
    """Respond to a direct mention — always reply."""
    global _bot_last_response
    now = time.time()
    if now - _bot_last_response < 2:
        return
    _bot_last_response = now

    settings = get_settings()
    api_key = settings.OPENAI_API_KEY
    if not api_key:
        return

    try:
        prices = await _fetch_prices()
        raw = await redis.lrange(REDIS_KEY, -10, -1)
        recent = [json.loads(m) for m in raw]

        messages = [{"role": "system", "content": _get_system_prompt(prices)}]
        for msg in recent[-6:]:
            if msg.get("anon_id") == BOT_ANON_ID:
                messages.append({"role": "assistant", "content": msg.get("content", "")})
            else:
                nick = msg.get("nickname", "익명")
                messages.append({"role": "user", "content": f"{nick}: {msg.get('content', '')}"})

        if not any(user_content in m.get("content", "") for m in messages if m["role"] == "user"):
            messages.append({"role": "user", "content": user_content})

        content = await _call_openai(api_key, messages)
        if content:
            await _send_bot_message(content, redis)

    except Exception as e:
        logger.warning(f"AI chatbot direct error: {e}")


async def _ai_maybe_join(redis):
    """Periodically check if the bot should naturally join the conversation."""
    global _bot_last_response
    now = time.time()
    if now - _bot_last_response < 10:
        return
    _bot_last_response = now

    settings = get_settings()
    api_key = settings.OPENAI_API_KEY
    if not api_key:
        return

    try:
        prices = await _fetch_prices()
        raw = await redis.lrange(REDIS_KEY, -8, -1)
        recent = [json.loads(m) for m in raw]
        if not recent:
            return

        # Don't join if the last message was from the bot itself
        if recent[-1].get("anon_id") == BOT_ANON_ID:
            return

        # Build context for the judge prompt
        chat_lines = []
        for msg in recent:
            nick = msg.get("nickname", "익명")
            chat_lines.append(f"{nick}: {msg.get('content', '')}")

        messages = [
            {"role": "system", "content": _get_judge_prompt(prices)},
            {"role": "user", "content": "\n".join(chat_lines)},
        ]

        response = await _call_openai(api_key, messages, max_tokens=150)
        if not response:
            return

        lines = response.strip().split("\n", 1)
        verdict = lines[0].strip().upper()

        if verdict == "YES" and len(lines) > 1:
            content = lines[1].strip()
            if content:
                await _send_bot_message(content, redis)

    except Exception as e:
        logger.warning(f"AI chatbot join error: {e}")


async def _handle_command(command: str, redis):
    """Handle slash commands."""
    global _bot_last_response
    _bot_last_response = time.time()

    if command == "/brief":
        await _send_briefing(redis)
    elif command == "/summary":
        await _send_summary(redis)
    elif command == "/rules":
        await _send_bot_message(BOT_RULES_TEXT, redis)


async def _send_briefing(redis):
    """Send a market briefing message."""
    prices = await _fetch_prices()
    if not prices:
        await _send_bot_message("시세 데이터를 가져올 수 없음 😅 잠시 후 다시 해봐", redis)
        return

    kst = datetime.now(timezone(timedelta(hours=9)))
    time_str = kst.strftime("%H:%M")

    lines = [f"📊 {time_str} 시장 브리핑"]
    price_parts = []
    for symbol in ["BTC", "ETH", "XRP", "SOL", "DOGE"]:
        p = prices.get(symbol)
        if not p:
            continue
        sign = "+" if p["change_pct"] >= 0 else ""
        price_parts.append(f"{symbol} {_format_price(p['price'])} ({sign}{p['change_pct']}%)")
    lines.append(" | ".join(price_parts))

    # Add a short market comment based on BTC movement
    btc = prices.get("BTC", {})
    btc_chg = btc.get("change_pct", 0)
    if btc_chg > 3:
        lines.append("\nBTC 강세장 🔥 알트들도 같이 올라갈 가능성 높음")
    elif btc_chg > 0.5:
        lines.append("\n소폭 상승 중. 거래량 확인하면서 지켜보자")
    elif btc_chg < -3:
        lines.append("\n급락 중 ⚠️ 추가 하락 가능성 열려있으니 조심")
    elif btc_chg < -0.5:
        lines.append("\n약세 흐름. 지지선 주목하자")
    else:
        lines.append("\n횡보 중. 방향 나올 때까지 관망도 전략이야")

    lines.append("궁금한 거 던져봐 💬")

    await _send_bot_message("\n".join(lines), redis)


async def _send_summary(redis):
    """Summarize recent chat messages using AI."""
    settings = get_settings()
    api_key = settings.OPENAI_API_KEY
    if not api_key:
        return

    try:
        raw = await redis.lrange(REDIS_KEY, -50, -1)
        recent = [json.loads(m) for m in raw]
        # Filter out bot messages for summary
        user_msgs = [m for m in recent if m.get("anon_id") != BOT_ANON_ID]
        if len(user_msgs) < 3:
            await _send_bot_message("요약할 대화가 별로 없음 ㅋㅋ 더 떠들어봐", redis)
            return

        chat_lines = []
        for msg in user_msgs[-30:]:
            nick = msg.get("nickname", "익명")
            chat_lines.append(f"{nick}: {msg.get('content', '')}")

        messages = [
            {"role": "system", "content": (
                "아래 채팅방 대화를 3~5줄로 요약해줘.\n"
                "반말로 짧게, 핵심만. 이모지 1~2개 써도 됨.\n"
                "형식: '📝 최근 대화 요약' 제목 + 요약"
            )},
            {"role": "user", "content": "\n".join(chat_lines)},
        ]

        content = await _call_openai(api_key, messages, max_tokens=200)
        if content:
            await _send_bot_message(content, redis)

    except Exception as e:
        logger.warning(f"AI summary error: {e}")


async def _auto_briefing_check(redis):
    """Check if it's time for an auto-briefing and send one if so."""
    global _last_briefing_time
    now = time.time()
    if now - _last_briefing_time < BRIEFING_INTERVAL:
        return
    # Only send auto-briefing if there are active connections
    if not _connections:
        return
    _last_briefing_time = now
    await _send_briefing(redis)


async def _call_openai(api_key: str, messages: list, max_tokens: int = 200) -> str:
    """Call OpenAI chat completions API."""
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            "https://api.openai.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {api_key}"},
            json={
                "model": "gpt-4o-mini",
                "messages": messages,
                "max_tokens": max_tokens,
                "temperature": 0.9,
            },
        )
        resp.raise_for_status()
        data = resp.json()
        return data["choices"][0]["message"]["content"].strip()


async def _send_bot_message(content: str, redis):
    """Store and broadcast a bot message."""
    bot_msg = {
        "type": "message",
        "anon_id": BOT_ANON_ID,
        "nickname": BOT_NICKNAME,
        "emoji": BOT_EMOJI,
        "content": content,
        "timestamp": time.time(),
    }
    try:
        await redis.rpush(REDIS_KEY, json.dumps(bot_msg, ensure_ascii=False))
        await redis.ltrim(REDIS_KEY, -MAX_MESSAGES, -1)
    except Exception as e:
        logger.warning(f"AI bot Redis store error: {e}")

    await _broadcast(bot_msg)


# ─── REST ────────────────────────────────────────────────────────────────────

@router.get("/api/chat/info")
async def chat_info():
    redis = await get_redis()
    try:
        msg_count = await redis.llen(REDIS_KEY)
    except Exception:
        msg_count = 0
    return {"online_count": len(_connections), "message_count": msg_count}


@router.get("/api/chat/history")
async def get_chat_history():
    redis = await get_redis()
    try:
        raw = await redis.lrange(REDIS_KEY, -50, -1)
        messages = [json.loads(m) for m in raw]
    except Exception:
        messages = []
    return {"messages": messages}


# ─── WebSocket ───────────────────────────────────────────────────────────────

@router.websocket("/ws/chat")
async def chat_websocket(websocket: WebSocket, token: str = Query(None)):
    global _msg_counter

    user_id = None
    if token:
        try:
            payload = decode_token(token)
            if payload.get("type") == "access":
                user_id = payload.get("sub")
        except Exception:
            pass

    conn_key = user_id or f"guest_{secrets.token_hex(4)}"

    await websocket.accept()
    redis = await get_redis()

    anon_id = _generate_anon_id()
    emoji = _pick_emoji()
    nickname = f"익명_{anon_id}"

    if user_id:
        old_ws = _connections.get(conn_key)
        if old_ws:
            try:
                await old_ws.close(code=4000)
            except Exception:
                pass
    _connections[conn_key] = websocket

    try:
        await websocket.send_json({"type": "welcome", "anon_id": anon_id, "nickname": nickname, "emoji": emoji})

        try:
            raw = await redis.lrange(REDIS_KEY, -30, -1)
            history = [json.loads(m) for m in raw]
            await websocket.send_json({"type": "history", "messages": history})
        except Exception as e:
            logger.warning(f"Chat history send error: {e}")

        await _broadcast_online_count()

        while True:
            data = await websocket.receive_text()
            msg = json.loads(data)

            if msg.get("type") == "ping":
                await websocket.send_json({"type": "pong"})
                continue

            if msg.get("type") == "message":
                content = msg.get("content", "").strip()
                if not content:
                    continue
                content = sanitize_text(content)
                if len(content) > MAX_MESSAGE_LENGTH:
                    content = content[:MAX_MESSAGE_LENGTH]
                if not content:
                    continue

                chat_msg = {
                    "type": "message",
                    "anon_id": anon_id,
                    "nickname": nickname,
                    "emoji": emoji,
                    "content": content,
                    "timestamp": time.time(),
                }

                try:
                    await redis.rpush(REDIS_KEY, json.dumps(chat_msg, ensure_ascii=False))
                    await redis.ltrim(REDIS_KEY, -MAX_MESSAGES, -1)
                except Exception as e:
                    logger.warning(f"Chat Redis store error: {e}")

                await _broadcast(chat_msg, exclude=conn_key)

                # AI bot logic
                _msg_counter += 1
                cmd = _is_command(content)
                if cmd:
                    # Slash command → handle directly
                    asyncio.create_task(_handle_command(cmd, redis))
                elif _is_direct_mention(content):
                    # Direct mention → always respond
                    asyncio.create_task(_ai_respond_direct(content, redis))
                elif _msg_counter % 3 == 0:
                    # Every 3rd message → let AI decide if it should join
                    asyncio.create_task(_ai_maybe_join(redis))

                # Check for auto-briefing
                asyncio.create_task(_auto_briefing_check(redis))

    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.warning(f"Chat WS error for anon={anon_id}: {e}")
    finally:
        if _connections.get(conn_key) is websocket:
            _connections.pop(conn_key, None)
        await _broadcast_online_count()


async def _broadcast(message: dict, exclude: str | None = None):
    dead = []
    for uid, ws in _connections.items():
        if uid == exclude:
            continue
        try:
            await ws.send_json(message)
        except Exception:
            dead.append(uid)
    for uid in dead:
        _connections.pop(uid, None)


async def _broadcast_online_count():
    await _broadcast({"type": "online_count", "count": len(_connections)})
