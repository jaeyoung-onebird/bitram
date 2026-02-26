"""
BITRAM Tweet Content Generator v2
─────────────────────────────────
All tweets use real-time Upbit prices + Fear&Greed index.
Always includes: hashtags, bitram.co.kr link.
AI-powered via Claude Haiku for engaging, click-worthy content.
"""
import logging
import random
from datetime import datetime, timedelta, timezone

import httpx

from config import get_settings

logger = logging.getLogger(__name__)

KST = timezone(timedelta(hours=9))

# ─── Content Types & Weights ───────────────────────────────────────────

CONTENT_TYPES = {
    "market_pulse": 25,     # 실시간 시세 분석
    "hot_alert": 20,        # 급등락/공포탐욕 속보
    "trading_wisdom": 15,   # 시장 상황 기반 트레이딩 팁
    "platform_hook": 25,    # 가격 데이터 엮은 비트램 홍보
    "engagement": 15,       # 질문/의견/참여 유도
}


def pick_content_type(recent_types: list[str] | None = None) -> str:
    """Weighted random pick, avoiding last 3 types for variety."""
    available = dict(CONTENT_TYPES)
    if recent_types:
        for t in recent_types[-3:]:
            available.pop(t, None)
    if not available:
        available = dict(CONTENT_TYPES)
    types = list(available.keys())
    weights = [available[t] for t in types]
    return random.choices(types, weights=weights, k=1)[0]


# ─── Market Data Fetching ──────────────────────────────────────────────

UPBIT_TICKER_URL = "https://api.upbit.com/v1/ticker"
KEY_MARKETS = [
    "KRW-BTC", "KRW-ETH", "KRW-XRP", "KRW-SOL",
    "KRW-DOGE", "KRW-ADA", "KRW-AVAX", "KRW-LINK",
]
FNG_API_URL = "https://api.alternative.me/fng/?limit=1"


async def fetch_market_prices(markets: list[str] | None = None) -> list[dict]:
    """Fetch current prices from Upbit public ticker API."""
    markets = markets or KEY_MARKETS
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(
                UPBIT_TICKER_URL,
                params={"markets": ",".join(markets)},
            )
            resp.raise_for_status()
            return [
                {
                    "market": t["market"],
                    "symbol": t["market"].replace("KRW-", ""),
                    "price": float(t.get("trade_price", 0)),
                    "change_rate": float(t.get("signed_change_rate", 0)) * 100,
                    "change": t.get("change", "EVEN"),
                    "high_24h": float(t.get("high_price", 0)),
                    "low_24h": float(t.get("low_price", 0)),
                    "volume_24h": float(t.get("acc_trade_volume_24h", 0)),
                    "trade_value_24h": float(t.get("acc_trade_price_24h", 0)),
                }
                for t in resp.json()
            ]
    except Exception as e:
        logger.error(f"Failed to fetch Upbit prices: {e}")
        return []


async def fetch_fear_greed() -> dict | None:
    """Fetch Bitcoin Fear & Greed Index from alternative.me."""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(FNG_API_URL)
            resp.raise_for_status()
            data = resp.json()
            if data.get("data"):
                item = data["data"][0]
                value = int(item["value"])
                return {
                    "value": value,
                    "label": item["value_classification"],
                    "label_kr": _fng_label_kr(value),
                }
    except Exception as e:
        logger.warning(f"Fear & Greed fetch failed: {e}")
    return None


def _fng_label_kr(v: int) -> str:
    if v <= 25: return "극단적 공포"
    if v <= 40: return "공포"
    if v <= 60: return "중립"
    if v <= 75: return "탐욕"
    return "극단적 탐욕"


# ─── Formatters ────────────────────────────────────────────────────────

def _fmt_krw(value: float) -> str:
    if value >= 100:
        return f"{int(value):,}"
    return f"{value:,.2f}"


def _fmt_억(value: float) -> str:
    억 = value / 1e8
    if 억 >= 10000:
        return f"{억 / 10000:.1f}조"
    if 억 >= 1:
        return f"{억:,.0f}억"
    return f"{int(value):,}원"


def _coin_emoji(rate: float) -> str:
    if rate >= 5: return "🚀"
    if rate >= 2: return "📈"
    if rate >= 0: return "🔼"
    if rate >= -2: return "🔽"
    if rate >= -5: return "📉"
    return "💥"


def _time_label() -> str:
    h = datetime.now(KST).hour
    if h < 6: return "새벽"
    if h < 9: return "아침"
    if h < 12: return "오전"
    if h < 14: return "점심"
    if h < 18: return "오후"
    if h < 22: return "저녁"
    return "밤"


# ─── Hashtags & Link ──────────────────────────────────────────────────

LINK = "https://bitram.co.kr"

COIN_TAGS = {
    "BTC": "#비트코인", "ETH": "#이더리움", "XRP": "#리플",
    "SOL": "#솔라나", "DOGE": "#도지코인", "ADA": "#에이다",
    "AVAX": "#아발란체", "LINK": "#체인링크",
}
TAG_POOL = [
    "#업비트", "#코인", "#암호화폐", "#자동매매",
    "#트레이딩", "#노코드", "#코인봇",
]


def build_hashtags(symbols: list[str] | None = None) -> str:
    """#비트램 + 1-2 coin tags + 2 random extras."""
    tags = ["#비트램"]
    if symbols:
        for s in symbols[:2]:
            if s in COIN_TAGS:
                tags.append(COIN_TAGS[s])
    tags.extend(random.sample(TAG_POOL, 2))
    return " ".join(tags)


# ─── Market Context Builder ──────────────────────────────────────────

def build_market_context(prices: list[dict], fng: dict | None = None) -> str:
    """Build rich market context string for AI prompt."""
    lines = ["[실시간 업비트 시세]"]
    for p in prices:
        d = "+" if p["change_rate"] >= 0 else ""
        lines.append(
            f"  {p['symbol']}: {_fmt_krw(p['price'])}원 ({d}{p['change_rate']:.1f}%) "
            f"| 거래대금 {_fmt_억(p['trade_value_24h'])}"
        )

    if prices:
        top = max(prices, key=lambda p: p["change_rate"])
        bot = min(prices, key=lambda p: p["change_rate"])
        lines.append(
            f"\n[주목] 최고 상승: {top['symbol']} {top['change_rate']:+.1f}% "
            f"| 최고 하락: {bot['symbol']} {bot['change_rate']:+.1f}%"
        )

    if fng:
        lines.append(f"[공포탐욕지수] {fng['value']}/100 — {fng['label_kr']}")

    now = datetime.now(KST)
    lines.append(f"[시각] {now.strftime('%m/%d %H:%M')} KST ({_time_label()})")
    return "\n".join(lines)


# ─── AI Tweet Generation ────────────────────────────────────────────

SYSTEM_PROMPT = (
    "넌 비트램(BITRAM) 공식 트위터를 운영하는 크립토 트레이더 겸 마케터야.\n"
    "비트램 = 업비트 전용 노코드 자동매매 봇 빌더 (https://bitram.co.kr)\n\n"
    "규칙:\n"
    "1. 한국어, 반말/친근한 톤 (트위터 감성)\n"
    "2. 한글 130자 이내 (트위터는 한글을 2글자로 카운트하므로 짧게)\n"
    "3. 실시간 시세를 반드시 본문에 녹여서 작성\n"
    "4. 마지막에 반드시 https://bitram.co.kr 링크 포함\n"
    "5. 마지막에 반드시 해시태그 포함 (내가 줄 거 그대로 사용)\n"
    "6. 트윗 본문만 출력. 부연 설명/따옴표 금지\n"
    "7. 이모지 적극 활용\n"
    "8. '투자 주의' '리스크 관리' 같은 면책 문구 절대 금지\n"
    "9. 클릭하고 싶고 반응하고 싶게 작성 — 정보+재미 먼저\n"
    "10. 뻔한 광고 냄새 NO. 트레이더 친구가 톡 던지는 느낌으로"
)

TYPE_PROMPTS = {
    "market_pulse": (
        "실시간 시장 데이터를 보고 핵심 포인트 하나 짚어서 트윗 써줘.\n"
        "시세 숫자를 자연스럽게 넣고, 왜 이 움직임이 주목할 만한지 한마디.\n"
        "'비트램 자동매매' 언급 자연스럽게.\n\n"
        "{context}\n\n사용할 해시태그: {hashtags}"
    ),
    "hot_alert": (
        "시장 데이터에서 가장 핫한 포인트 골라서 속보/알림 스타일로 트윗 써.\n"
        "급등락, 공포탐욕 변화, 거래대금 폭증 등 — 긴급하고 눈에 띄게.\n"
        "비트램 링크 자연스럽게.\n\n"
        "{context}\n\n사용할 해시태그: {hashtags}"
    ),
    "trading_wisdom": (
        "지금 시장 상황에 딱 맞는 실전 트레이딩 팁 하나 트윗으로.\n"
        "뻔한 교과서 말고, 당장 써먹을 수 있는 구체적인 팁.\n"
        "비트램으로 이 전략 자동화 가능하다는 걸 슬쩍.\n\n"
        "{context}\n\n사용할 해시태그: {hashtags}"
    ),
    "platform_hook": (
        "실시간 시세를 활용해서 비트램 홍보 트윗.\n"
        "현재 시장 상황 → 문제 제기 → 비트램이 답이다 구조로.\n"
        "광고 같지 않게, 공감 먼저.\n\n"
        "{context}\n\n사용할 해시태그: {hashtags}"
    ),
    "engagement": (
        "시장 상황 보고 트레이더들이 반응하고 싶은 트윗 써.\n"
        "질문형/투표형/공감형 — 댓글과 RT 유도가 핵심.\n"
        "비트램 링크는 마지막에.\n\n"
        "{context}\n\n사용할 해시태그: {hashtags}"
    ),
}


async def _call_claude(user_prompt: str) -> str:
    """Call Claude API and return tweet text."""
    settings = get_settings()
    if not settings.ANTHROPIC_API_KEY:
        return ""
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(20.0, connect=5.0)) as client:
            resp = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": settings.ANTHROPIC_API_KEY,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json={
                    "model": settings.ANTHROPIC_MODEL,
                    "max_tokens": 350,
                    "temperature": 0.9,
                    "system": SYSTEM_PROMPT,
                    "messages": [{"role": "user", "content": user_prompt}],
                },
            )
            if resp.status_code >= 400:
                logger.warning(f"Claude API {resp.status_code}: {resp.text[:300]}")
                return ""
            data = resp.json()
            blocks = data.get("content") or []
            if blocks and isinstance(blocks[0], dict):
                text = str(blocks[0].get("text", "")).strip()
                # Remove wrapping quotes if AI adds them
                if text.startswith('"') and text.endswith('"'):
                    text = text[1:-1]
                return text
    except Exception as e:
        logger.error(f"Claude API call failed: {e}")
    return ""


# ─── Fallback Template ─────────────────────────────────────────────

def _fallback_tweet(prices: list[dict], fng: dict | None, hashtags: str) -> str:
    """Template-based fallback when AI fails."""
    if not prices:
        return ""

    top = max(prices, key=lambda p: abs(p["change_rate"]))
    emoji = _coin_emoji(top["change_rate"])
    d = "+" if top["change_rate"] >= 0 else ""

    parts = [
        f"{emoji} {top['symbol']} {_fmt_krw(top['price'])}원 ({d}{top['change_rate']:.1f}%)",
        "",
    ]

    others = sorted(
        [p for p in prices if p["symbol"] != top["symbol"]],
        key=lambda p: abs(p["change_rate"]),
        reverse=True,
    )[:3]
    for p in others:
        e = _coin_emoji(p["change_rate"])
        dd = "+" if p["change_rate"] >= 0 else ""
        parts.append(f"{e} {p['symbol']} {_fmt_krw(p['price'])}원 ({dd}{p['change_rate']:.1f}%)")

    parts.append("")
    if fng:
        parts.append(f"공포탐욕: {fng['value']} ({fng['label_kr']})")
        parts.append("")

    parts.append(f"자동매매로 대응 → {LINK}")
    parts.append("")
    parts.append(hashtags)
    return "\n".join(parts)


# ─── Weighted Char Helpers ────────────────────────────────────────

def _weighted_len(text: str) -> int:
    """Twitter counts CJK chars as 2, URLs as 23."""
    import re
    no_urls = re.sub(r'https?://\S+', 'x' * 23, text)
    return sum(2 if ord(c) > 127 else 1 for c in no_urls)


# ─── Ensure Link & Tags ────────────────────────────────────────────

def _ensure_link_and_tags(text: str, hashtags: str) -> str:
    """Guarantee every tweet has our link and hashtags, within weighted limit."""
    import re

    # Strip existing link and hashtags from body so we can re-append cleanly
    body = text
    body = re.sub(r'https?://bitram\.co\.kr\S*', '', body)
    body = re.sub(r'#\S+', '', body)
    body = re.sub(r'\n{3,}', '\n\n', body).strip()

    suffix = f"\n\n{LINK}\n{hashtags}"
    suffix_wlen = _weighted_len(suffix)
    max_body_wlen = 274 - suffix_wlen

    # Trim body to fit
    original_body = body
    while _weighted_len(body) > max_body_wlen and body:
        body = body[:-1]
    if body != original_body:
        body = body.rstrip() + "…"

    return body + suffix


# ─── Thread Generation ────────────────────────────────────────────

THREAD_SYSTEM_PROMPT = (
    "넌 비트램(BITRAM) 공식 트위터를 운영하는 크립토 트레이더 겸 마케터야.\n"
    "비트램 = 업비트 전용 노코드 자동매매 봇 빌더 (https://bitram.co.kr)\n\n"
    "지금부터 트위터 스레드(3개 트윗)를 작성해.\n\n"
    "규칙:\n"
    "1. 한국어, 반말/친근한 톤\n"
    "2. 각 트윗은 한글 100자 이내 (트위터는 한글 2글자 카운트)\n"
    "3. 트윗 1: 시세 훅 — 실시간 데이터로 관심 끌기 (이모지+숫자)\n"
    "4. 트윗 2: 분석/팁 — 왜 이 움직임이 중요한지, 어떻게 대응해야 하는지\n"
    "5. 트윗 3: CTA — 비트램 자동매매로 해결, 링크+해시태그\n"
    "6. 각 트윗을 ---로 구분해서 출력\n"
    "7. 부연 설명/따옴표/번호 매기기 금지. 트윗 본문만 출력\n"
    "8. 이모지 적극 활용\n"
    "9. '투자 주의' '리스크 관리' 같은 면책 문구 절대 금지\n"
    "10. 뻔한 광고 냄새 NO. 트레이더 친구가 얘기하는 느낌"
)

THREAD_USER_PROMPT = (
    "아래 실시간 시장 데이터를 보고 3개 트윗 스레드를 써줘.\n\n"
    "{context}\n\n"
    "트윗 3에 사용할 링크: {link}\n"
    "트윗 3에 사용할 해시태그: {hashtags}\n\n"
    "형식:\n"
    "트윗 내용1\n---\n트윗 내용2\n---\n트윗 내용3"
)


async def generate_thread_content(db=None) -> list[str]:
    """
    Generate a 3-tweet thread. Returns list of tweet texts.
    """
    prices = await fetch_market_prices()
    fng = await fetch_fear_greed()

    context = build_market_context(prices, fng) if prices else "시장 데이터 없음"
    top_symbols = [
        p["symbol"]
        for p in sorted(prices, key=lambda p: abs(p["change_rate"]), reverse=True)[:2]
    ] if prices else []
    hashtags = build_hashtags(top_symbols)

    user_prompt = THREAD_USER_PROMPT.format(
        context=context, link=LINK, hashtags=hashtags,
    )

    raw = await _call_claude_thread(user_prompt)
    if not raw:
        return _fallback_thread(prices, fng, hashtags)

    # Parse "---" separated tweets
    parts = [p.strip() for p in raw.split("---") if p.strip()]
    if len(parts) < 2:
        # Try newline-based split as fallback
        parts = [p.strip() for p in raw.split("\n\n") if p.strip()]

    tweets = parts[:3] if len(parts) >= 3 else parts

    # Ensure last tweet has link + hashtags
    if tweets:
        last = tweets[-1]
        if "bitram.co.kr" not in last:
            last = last + f"\n\n{LINK}"
        if "#비트램" not in last:
            last = last + f"\n{hashtags}"
        tweets[-1] = last

    return tweets


async def _call_claude_thread(user_prompt: str) -> str:
    """Call Claude for thread generation."""
    settings = get_settings()
    if not settings.ANTHROPIC_API_KEY:
        return ""
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(25.0, connect=5.0)) as client:
            resp = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": settings.ANTHROPIC_API_KEY,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json={
                    "model": settings.ANTHROPIC_MODEL,
                    "max_tokens": 600,
                    "temperature": 0.9,
                    "system": THREAD_SYSTEM_PROMPT,
                    "messages": [{"role": "user", "content": user_prompt}],
                },
            )
            if resp.status_code >= 400:
                logger.warning(f"Claude thread API {resp.status_code}: {resp.text[:300]}")
                return ""
            data = resp.json()
            blocks = data.get("content") or []
            if blocks and isinstance(blocks[0], dict):
                text = str(blocks[0].get("text", "")).strip()
                if text.startswith('"') and text.endswith('"'):
                    text = text[1:-1]
                return text
    except Exception as e:
        logger.error(f"Claude thread API failed: {e}")
    return ""


def _fallback_thread(prices: list[dict], fng: dict | None, hashtags: str) -> list[str]:
    """Template-based fallback thread."""
    if not prices:
        return []

    top = max(prices, key=lambda p: abs(p["change_rate"]))
    d = "+" if top["change_rate"] >= 0 else ""
    emoji = _coin_emoji(top["change_rate"])

    tweet1 = (
        f"{emoji} {top['symbol']} {_fmt_krw(top['price'])}원 ({d}{top['change_rate']:.1f}%)\n"
        f"공포탐욕지수 {fng['value']}/100 ({fng['label_kr']})" if fng else
        f"{emoji} {top['symbol']} {_fmt_krw(top['price'])}원 ({d}{top['change_rate']:.1f}%)"
    )

    others = sorted(
        [p for p in prices if p["symbol"] != top["symbol"]],
        key=lambda p: abs(p["change_rate"]), reverse=True,
    )[:3]
    lines = [f"{_coin_emoji(p['change_rate'])} {p['symbol']} {_fmt_krw(p['price'])}원 ({'+' if p['change_rate'] >= 0 else ''}{p['change_rate']:.1f}%)" for p in others]
    tweet2 = "\n".join(lines) if lines else "시장 전반 혼조세"

    tweet3 = f"이런 장세엔 자동매매가 답!\n\n{LINK}\n{hashtags}"

    return [tweet1, tweet2, tweet3]


# ─── Main Entry Point ──────────────────────────────────────────────

async def generate_tweet_content(
    content_type: str,
    db=None,
) -> tuple[str, str]:
    """
    Generate a tweet. All types use real-time market data + AI.
    Returns (content_type, tweet_text).
    """
    # 1. Fetch live market data
    prices = await fetch_market_prices()
    fng = await fetch_fear_greed()

    # 2. Build context & hashtags
    context = build_market_context(prices, fng) if prices else "시장 데이터 없음"
    top_symbols = [
        p["symbol"]
        for p in sorted(prices, key=lambda p: abs(p["change_rate"]), reverse=True)[:2]
    ] if prices else []
    hashtags = build_hashtags(top_symbols)

    # 3. AI generation
    prompt_tpl = TYPE_PROMPTS.get(content_type, TYPE_PROMPTS["market_pulse"])
    user_prompt = prompt_tpl.format(context=context, hashtags=hashtags)
    text = await _call_claude(user_prompt)

    # 4. Ensure link + tags
    if text:
        text = _ensure_link_and_tags(text, hashtags)

    # 5. Fallback if AI failed
    if not text:
        text = _fallback_tweet(prices, fng, hashtags)

    return content_type, text
