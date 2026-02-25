from __future__ import annotations

import asyncio
import logging
import time
from typing import Annotated

from fastapi import APIRouter, Query

from config import get_settings
from core.ai_translate import translate_text
from core.feed_reader import fetch_feed, FeedEntry
from core.redis_cache import cache_get, cache_set

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/feeds", tags=["feeds"])
settings = get_settings()

def _clamp(s: str, n: int) -> str:
    s = (s or "").strip()
    if len(s) <= n:
        return s
    return s[: max(0, n - 1)].rstrip() + "…"


def _split_urls(raw: str) -> list[str]:
    if not raw:
        return []
    out: list[str] = []
    for part in raw.split(","):
        u = part.strip()
        if u:
            out.append(u)
    return out


def _guess_source(url: str) -> str:
    u = (url or "").lower()
    if "/twitter/user/" in u:
        try:
            handle = u.split("/twitter/user/", 1)[1].split("/", 1)[0].strip()
            if handle:
                return f"X@{handle}"
        except Exception:
            pass
    if "coindesk" in u:
        return "CoinDesk"
    if "cointelegraph" in u:
        return "Cointelegraph"
    if "decrypt" in u:
        return "Decrypt"
    if "rsshub" in u:
        return "RSSHub"
    return url.split("/")[2] if "://" in url else url[:32]


async def _load_feeds(urls: list[str], limit: int) -> list[FeedEntry]:
    if not urls:
        return []
    results = await asyncio.gather(
        *[fetch_feed(u, source=_guess_source(u)) for u in urls],
        return_exceptions=True,
    )
    items: list[FeedEntry] = []
    for r in results:
        if isinstance(r, Exception):
            continue
        items.extend(r)

    # Sort by parsed timestamp (best-effort). Unknown dates go to the bottom.
    items = sorted(items, key=lambda e: (e.published_ts is not None, e.published_ts or 0), reverse=True)
    return items[:limit]


@router.get("/news")
async def get_news(
    limit: Annotated[int, Query(ge=1, le=50)] = 15,
    translate: Annotated[int, Query(ge=0, le=1)] = 1,
):
    cache_key = f"feeds:news:{limit}:{translate}"
    cached = await cache_get(cache_key)
    if cached is not None:
        return cached

    # Default sources if not configured (real RSS, no fake data).
    urls = _split_urls(settings.NEWS_FEED_URLS) or [
        "https://cointelegraph.com/rss",
        "https://www.coindesk.com/arc/outboundfeeds/rss/?outputType=xml",
        "https://decrypt.co/feed",
        "https://www.blockmedia.co.kr/feed",
        "https://www.coindeskkorea.com/feed",
    ]
    items = await _load_feeds(urls, limit=limit)

    out = []
    for it in items:
        title_ko = await translate_text(it.title) if translate else it.title
        out.append(
            {
                "source": it.source,
                "title": _clamp(it.title, 140),
                "title_ko": _clamp(title_ko, 140),
                "url": it.url,
                "published_at": it.published_at,
                "published_ts": it.published_ts,
            }
        )
    result = {"items": out}
    await cache_set(cache_key, result, ttl=300)  # 5분 캐시
    return result


# ─── X Feed ─────────────────────────────────────────────────────────────


@router.get("/x")
async def get_x_feed(
    limit: Annotated[int, Query(ge=1, le=50)] = 15,
    translate: Annotated[int, Query(ge=0, le=1)] = 1,
):
    """
    X/Twitter feed.
    1) auth_token 쿠키 기반 스크래핑 (TWITTER_AUTH_TOKEN 설정 시)
    2) RSS URL 폴백 (X_FEED_URLS 설정 시)
    3) 둘 다 없으면 추천 계정 리스트 반환
    """
    cache_key = f"feeds:x:{limit}:{translate}"
    cached = await cache_get(cache_key)
    if cached is not None:
        return cached

    settings = get_settings()
    auth_token = settings.TWITTER_AUTH_TOKEN.strip()
    usernames_raw = settings.X_FEED_USERNAMES.strip()
    usernames = [u.strip() for u in usernames_raw.split(",") if u.strip()] if usernames_raw else []

    # ── 1. auth_token 스크래핑 ──
    if auth_token and usernames:
        try:
            from core.twitter_scraper import fetch_multiple_users_tweets

            tweets = await fetch_multiple_users_tweets(
                auth_token=auth_token,
                usernames=usernames,
                per_user=5,
                total_limit=limit,
            )
            if tweets:
                out = []
                for tw in tweets:
                    title = _clamp(tw.text, 280)
                    title_ko = await translate_text(title) if translate else title
                    out.append({
                        "source": f"@{tw.author_username}",
                        "title": title,
                        "title_ko": _clamp(title_ko, 280),
                        "summary": "",
                        "summary_ko": "",
                        "url": tw.url,
                        "published_at": tw.created_at,
                        "published_ts": tw.published_ts,
                    })
                result = {"items": out, "configured": True}
                await cache_set(cache_key, result, ttl=120)  # 2분 캐시
                return result
            else:
                logger.warning("Twitter scraper returned no tweets, falling back to RSS")
        except Exception as e:
            logger.error("Twitter scraper failed: %s", e)

    # ── 2. RSS 폴백 ──
    urls = _split_urls(settings.X_FEED_URLS)
    if urls:
        items = await _load_feeds(urls, limit=limit)
        out = []
        for it in items:
            title_ko = await translate_text(it.title) if translate else it.title
            summary = _clamp((it.summary or "").strip(), 400)
            summary_ko = await translate_text(summary) if (translate and summary) else summary
            out.append({
                "source": it.source,
                "title": _clamp(it.title, 160),
                "title_ko": _clamp(title_ko, 160),
                "summary": _clamp(summary, 220),
                "summary_ko": _clamp(summary_ko, 220),
                "url": it.url,
                "published_at": it.published_at,
                "published_ts": it.published_ts,
            })
        result = {"items": out, "configured": True}
        await cache_set(cache_key, result, ttl=120)  # 2분 캐시
        return result

    # ── 3. 추천 계정 리스트 (피드 없음) ──
    accounts = [
        {"username": u, "url": f"https://x.com/{u}"}
        for u in usernames
    ]
    return {"items": [], "configured": True, "accounts": accounts}
