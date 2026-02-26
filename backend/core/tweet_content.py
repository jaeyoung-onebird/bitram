"""
BITRAM Tweet Content Generator
Generates tweet content for automated posting.
70% AI-generated (Claude), 30% template-based.
"""
import logging
import random
from datetime import datetime, timedelta, timezone
from typing import Optional

import httpx

from config import get_settings

logger = logging.getLogger(__name__)

# ─── Content Types & Weights ──────────────────────────────────────────────

CONTENT_TYPES = [
    "price_alert",
    "community_highlight",
    "trading_tip",
    "platform_promo",
    "market_analysis",
]

# AI types (70%): trading_tip, market_analysis, platform_promo
# Template types (30%): price_alert, community_highlight
CONTENT_WEIGHTS = {
    "price_alert": 15,
    "community_highlight": 15,
    "trading_tip": 25,
    "platform_promo": 20,
    "market_analysis": 25,
}


def pick_content_type(recent_types: list[str] | None = None) -> str:
    """Pick a content type using weighted random, avoiding last 2 types."""
    available = dict(CONTENT_WEIGHTS)
    if recent_types:
        for t in recent_types[-2:]:
            available.pop(t, None)
    if not available:
        available = dict(CONTENT_WEIGHTS)

    types = list(available.keys())
    weights = [available[t] for t in types]
    return random.choices(types, weights=weights, k=1)[0]


# ─── Market Data (Upbit Public API) ──────────────────────────────────────

UPBIT_TICKER_URL = "https://api.upbit.com/v1/ticker"
KEY_MARKETS = ["KRW-BTC", "KRW-ETH", "KRW-XRP", "KRW-SOL"]


async def fetch_market_prices(
    markets: list[str] | None = None,
) -> list[dict]:
    """Fetch current prices from Upbit public ticker API (no auth needed)."""
    markets = markets or KEY_MARKETS
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(
                UPBIT_TICKER_URL,
                params={"markets": ",".join(markets)},
            )
            resp.raise_for_status()
            data = resp.json()
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
                for t in data
            ]
    except Exception as e:
        logger.error(f"Failed to fetch market prices: {e}")
        return []


def _fmt_krw(value: float) -> str:
    """Format a number as Korean Won string."""
    if value >= 100:
        return f"{int(value):,}"
    return f"{value:,.2f}"


def _fmt_억(value: float) -> str:
    """Format large KRW values in 억 units."""
    억 = value / 100_000_000
    if 억 >= 10000:
        return f"{억 / 10000:.1f}조"
    if 억 >= 1:
        return f"{억:,.0f}억"
    return f"{int(value):,}원"


# ─── Hashtags ────────────────────────────────────────────────────────────

FIXED_HASHTAGS = "#비트램 #업비트 #노코드 #자동매매 #봇 #코인봇"


def _pick_hashtags(content_type: str = "") -> str:
    """Return fixed hashtag string."""
    return FIXED_HASHTAGS


# ─── Template-Based Content ──────────────────────────────────────────────

PRICE_ALERT_TEMPLATES = [
    # 단일 코인 상세 (가장 변동 큰 코인)
    (
        "{symbol} {direction_emoji} {direction_text}\n"
        "현재가: {price}원 ({direction}{change_rate:.1f}%)\n\n"
        "24h 고가 {high}원 | 저가 {low}원\n"
        "거래대금 {trade_value}\n\n"
        "비트램에서 자동매매 시작하기\n"
        "https://bitram.co.kr\n\n"
        "{hashtags}"
    ),
    (
        "[시세] {symbol} {price}원 ({direction}{change_rate:.1f}%)\n\n"
        "고가/저가: {high} / {low}원\n"
        "거래대금: {trade_value}\n\n"
        "노코드 자동매매 봇 만들기 → https://bitram.co.kr\n\n"
        "{hashtags}"
    ),
]

# 전체 시장 요약 템플릿 (4개 코인 한눈에)
MARKET_SUMMARY_TEMPLATE = (
    "📊 업비트 시세 현황\n\n"
    "{coin_lines}\n\n"
    "총 거래대금: {total_value}\n\n"
    "자동매매로 대응하기 → https://bitram.co.kr\n\n"
    "{hashtags}"
)

PLATFORM_PROMO_TEMPLATES = [
    # 공감형 - 고통 포인트 자극
    (
        "새벽 3시에 차트 보다가 잠들어서\n"
        "손절 타이밍 놓친 적 있으시죠?\n\n"
        "봇은 안 잡니다.\n"
        "봇은 안 졸립니다.\n"
        "봇은 감정이 없습니다.\n\n"
        "비트램에서 내 전략 그대로 봇으로 만들어보세요.\n"
        "코딩 필요 없습니다.\n\n"
        "https://bitram.co.kr\n\n"
        "{hashtags}"
    ),
    # FOMO 자극형
    (
        "어제 폭락할 때\n"
        "자동 손절로 피한 사람들이 있습니다.\n\n"
        "오늘 반등할 때\n"
        "자동 매수로 들어간 사람들이 있습니다.\n\n"
        "차이는 딱 하나.\n"
        "봇이 있냐 없냐.\n\n"
        "https://bitram.co.kr\n\n"
        "{hashtags}"
    ),
    # 비교형 - 코딩 vs 노코드
    (
        "파이썬 배워서 봇 만들기:\n"
        "📚 3개월 공부\n"
        "💻 수백 줄 코드\n"
        "🐛 끝없는 디버깅\n\n"
        "비트램으로 봇 만들기:\n"
        "✅ 전략 선택\n"
        "✅ 조건 설정\n"
        "✅ 실행\n\n"
        "5분이면 됩니다.\n"
        "https://bitram.co.kr\n\n"
        "{hashtags}"
    ),
    # 스토리텔링형
    (
        "직장인 A씨는 출근 전에 매수하고\n"
        "퇴근 후에 확인합니다.\n\n"
        "그 사이 봇이 3번 매도하고\n"
        "2번 재매수 했습니다.\n\n"
        "월급 외 수익? 전략이 만들어줍니다.\n\n"
        "비트램 - 업비트 전용 노코드 자동매매\n"
        "https://bitram.co.kr\n\n"
        "{hashtags}"
    ),
    # 질문형 - 참여 유도
    (
        "코인 자동매매 해보신 분?\n\n"
        "솔직히 말해주세요.\n"
        "수동으로 매매해서 수익 꾸준한 분 있나요?\n\n"
        "감정 빼고 전략만 남기면\n"
        "결과가 달라집니다.\n\n"
        "비트램에서 무료로 시작해보세요.\n"
        "https://bitram.co.kr\n\n"
        "{hashtags}"
    ),
    # 의문형 - 호기심 유발
    (
        "\"자동매매 진짜 돼요?\"\n\n"
        "매일 듣는 질문입니다.\n"
        "답은 전략에 달려 있습니다.\n\n"
        "비트램은 당신의 전략을\n"
        "24시간 쉬지 않고 실행해주는 도구일 뿐.\n\n"
        "좋은 전략 + 자동 실행 = ?\n"
        "직접 확인해보세요.\n\n"
        "https://bitram.co.kr\n\n"
        "{hashtags}"
    ),
    # 현실 비교형
    (
        "코인 수동 매매:\n"
        "😰 차트 계속 확인\n"
        "😤 감정적 매매\n"
        "😴 새벽에도 못 자고\n"
        "📉 결국 손실\n\n"
        "비트램 자동매매:\n"
        "🤖 24시간 자동 실행\n"
        "📊 전략대로만 매매\n"
        "😴 자는 동안에도 수익\n\n"
        "https://bitram.co.kr\n\n"
        "{hashtags}"
    ),
    # 한줄 임팩트형
    (
        "당신이 자는 동안에도\n"
        "봇은 일하고 있습니다.\n\n"
        "업비트 노코드 자동매매\n"
        "비트램에서 시작하세요.\n\n"
        "https://bitram.co.kr\n\n"
        "{hashtags}"
    ),
]

COMMUNITY_HIGHLIGHT_TEMPLATE = (
    '[커뮤니티 인기글]\n\n"{title}"\nby {author}\n'
    "좋아요 {likes} | 댓글 {comments}\n\n"
    "비트램 커뮤니티에서 더 많은 글을 확인하세요\n"
    "https://bitram.co.kr/community\n\n"
    "{hashtags}"
)


def _coin_emoji(change: str) -> str:
    if change == "RISE":
        return "🔼"
    elif change == "FALL":
        return "🔽"
    return "➖"


def _coin_direction_text(change: str) -> str:
    if change == "RISE":
        return "상승 중"
    elif change == "FALL":
        return "하락 중"
    return "보합"


async def generate_price_alert() -> str:
    """Generate a price alert tweet from Upbit data."""
    prices = await fetch_market_prices()
    if not prices:
        return ""

    # 50% 확률로 전체 시장 요약 vs 단일 코인 상세
    if random.random() < 0.5 and len(prices) >= 2:
        return _generate_market_summary(prices)
    return _generate_single_coin_alert(prices)


def _generate_market_summary(prices: list[dict]) -> str:
    """4개 코인 전체 시장 요약."""
    coin_lines = []
    for p in prices:
        emoji = _coin_emoji(p["change"])
        d = "+" if p["change_rate"] >= 0 else "-"
        coin_lines.append(
            f"{emoji} {p['symbol']}: {_fmt_krw(p['price'])}원 ({d}{abs(p['change_rate']):.1f}%)"
        )

    total_value = sum(p["trade_value_24h"] for p in prices)

    return MARKET_SUMMARY_TEMPLATE.format(
        coin_lines="\n".join(coin_lines),
        total_value=_fmt_억(total_value),
        hashtags=_pick_hashtags("price_alert"),
    )


def _generate_single_coin_alert(prices: list[dict]) -> str:
    """가장 변동이 큰 단일 코인 상세 알림."""
    coin = max(prices, key=lambda p: abs(p["change_rate"]))

    direction_emoji = _coin_emoji(coin["change"])
    direction_text = _coin_direction_text(coin["change"])
    direction = "+" if coin["change_rate"] >= 0 else "-"

    template = random.choice(PRICE_ALERT_TEMPLATES)
    return template.format(
        symbol=coin["symbol"],
        price=_fmt_krw(coin["price"]),
        change_rate=abs(coin["change_rate"]),
        direction=direction,
        direction_emoji=direction_emoji,
        direction_text=direction_text,
        high=_fmt_krw(coin["high_24h"]),
        low=_fmt_krw(coin["low_24h"]),
        volume=coin["volume_24h"],
        trade_value=_fmt_억(coin["trade_value_24h"]),
        hashtags=_pick_hashtags("price_alert"),
    )


async def generate_community_highlight(db) -> str:
    """Pull the most-liked post from the last 24h."""
    from db.models import Post, User
    from sqlalchemy import select

    since = datetime.now(timezone.utc) - timedelta(hours=24)
    stmt = (
        select(Post, User.nickname)
        .join(User, User.id == Post.user_id)
        .where(Post.created_at >= since, Post.like_count >= 1)
        .order_by(Post.like_count.desc())
        .limit(1)
    )
    result = await db.execute(stmt)
    row = result.first()
    if not row:
        return ""

    post, nickname = row
    title = post.title[:40] + ("..." if len(post.title) > 40 else "")
    return COMMUNITY_HIGHLIGHT_TEMPLATE.format(
        title=title,
        author=nickname,
        likes=post.like_count,
        comments=post.comment_count,
        hashtags=_pick_hashtags("community_highlight"),
    )


def generate_platform_promo_template() -> str:
    """Pick a random platform promo template."""
    template = random.choice(PLATFORM_PROMO_TEMPLATES)
    return template.format(hashtags=_pick_hashtags("platform_promo"))


# ─── AI-Generated Content (Claude API) ───────────────────────────────────

async def generate_ai_content(
    content_type: str,
    market_context: str = "",
) -> str:
    """Generate tweet content using Claude API (httpx pattern from ai_translate.py)."""
    settings = get_settings()
    if not settings.ANTHROPIC_API_KEY:
        logger.warning("ANTHROPIC_API_KEY not set, falling back to template")
        return ""

    system_prompt = (
        "당신은 BITRAM(비트램)의 공식 트위터 계정을 운영하는 마케터입니다. "
        "비트램은 업비트 전용 노코드 자동매매 봇 빌더 플랫폼입니다. "
        "한국 암호화폐 트레이더를 대상으로 합니다. "
        "트윗은 반드시 한국어로 작성하세요. "
        "트윗은 280자 이내여야 합니다. "
        "자연스럽고 친근한 톤을 사용하세요. "
        "트윗 끝에 반드시 다음 해시태그를 포함하세요: #비트램 #업비트 #노코드 #자동매매 #봇 #코인봇 "
        "bitram.co.kr 링크를 자연스럽게 포함하세요. "
        "트윗 텍스트만 출력하세요. 부연 설명은 하지 마세요."
    )

    prompts = {
        "trading_tip": (
            "암호화폐 트레이딩 팁 하나를 트윗으로 작성해주세요. "
            "실질적이고 유용한 팁이어야 합니다. 예: 손절 설정, 분할 매수, "
            "감정 관리, 기술적 분석 기초 등. "
            "비트램 자동매매 봇을 자연스럽게 언급하세요."
        ),
        "market_analysis": (
            f"현재 시장 데이터를 바탕으로 짧은 시장 분석 트윗을 작성해주세요.\n\n"
            f"시장 데이터:\n{market_context}\n\n"
            "트레이더에게 도움이 되는 간결한 분석을 제공하세요. "
            "과도한 예측이나 투자 권유는 피하세요. "
            "비트램 자동매매의 장점을 자연스럽게 연결하세요."
        ),
        "platform_promo": (
            "비트램 플랫폼의 장점을 소개하는 트윗을 작성해주세요. "
            "노코드 자동매매, 전략 공유 커뮤니티, 수익 인증, "
            "백테스팅 기능 중 하나를 골라 매력적으로 소개하세요. "
            "너무 광고 같지 않게, 유저 관점에서 작성하세요."
        ),
    }

    user_prompt = prompts.get(content_type)
    if not user_prompt:
        return ""

    model = settings.ANTHROPIC_MODEL
    try:
        timeout = httpx.Timeout(timeout=15.0, connect=5.0)
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": settings.ANTHROPIC_API_KEY,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json={
                    "model": model,
                    "max_tokens": 300,
                    "temperature": 0.8,
                    "system": system_prompt,
                    "messages": [{"role": "user", "content": user_prompt}],
                },
            )
            if resp.status_code >= 400:
                logger.warning(f"Claude API error {resp.status_code}: {resp.text[:500]}")
                return ""
            data = resp.json()
            content = data.get("content") or []
            if content and isinstance(content, list) and isinstance(content[0], dict):
                tweet_text = str(content[0].get("text") or "").strip()
                # Remove wrapping quotes if AI adds them
                if tweet_text.startswith('"') and tweet_text.endswith('"'):
                    tweet_text = tweet_text[1:-1]
                return tweet_text[:280]
            return ""
    except Exception as e:
        logger.error(f"AI content generation failed: {e}")
        return ""


# ─── Main Generator Entry Point ──────────────────────────────────────────

async def generate_tweet_content(
    content_type: str,
    db=None,
) -> tuple[str, str]:
    """
    Generate tweet content for the given type.
    Returns (final_content_type, tweet_text).
    Falls back to template if AI fails.
    """
    text = ""

    if content_type == "price_alert":
        text = await generate_price_alert()

    elif content_type == "community_highlight":
        if db:
            text = await generate_community_highlight(db)
        if not text:
            text = await generate_price_alert()
            content_type = "price_alert"

    elif content_type == "trading_tip":
        text = await generate_ai_content("trading_tip")
        if not text:
            text = generate_platform_promo_template()
            content_type = "platform_promo"

    elif content_type == "platform_promo":
        settings = get_settings()
        if random.random() < 0.5 and settings.ANTHROPIC_API_KEY:
            text = await generate_ai_content("platform_promo")
        if not text:
            text = generate_platform_promo_template()

    elif content_type == "market_analysis":
        prices = await fetch_market_prices()
        if prices:
            context_lines = []
            for p in prices:
                direction = "+" if p["change_rate"] >= 0 else ""
                context_lines.append(
                    f"{p['symbol']}: {_fmt_krw(p['price'])}원 "
                    f"({direction}{p['change_rate']:.1f}%)"
                )
            market_context = "\n".join(context_lines)
            text = await generate_ai_content("market_analysis", market_context)
        if not text:
            text = await generate_price_alert()
            content_type = "price_alert"

    return content_type, text
