from __future__ import annotations

import asyncio
import logging
import time
from typing import Annotated

from fastapi import APIRouter, Query

from config import get_settings
from core.ai_translate import translate_text
from core.feed_reader import fetch_feed, FeedEntry

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
    return {"items": out}


# ─── X Feed via Twitter API v2 ──────────────────────────────────────────

# In-memory cache for X feed (avoid hitting Twitter API rate limits)
_x_feed_cache: dict = {"items": [], "ts": 0}
_X_CACHE_TTL = 300  # 5 minutes


def _fetch_x_feed_api_sync(usernames: list[str], limit: int) -> list[dict]:
    """Fetch recent tweets from given usernames via Twitter API v2 search (sync)."""
    import tweepy

    settings = get_settings()
    bearer = settings.TWITTER_BEARER_TOKEN
    if not bearer:
        logger.warning("TWITTER_BEARER_TOKEN not set, X feed unavailable")
        return []

    client = tweepy.Client(bearer_token=bearer, wait_on_rate_limit=False)

    # Build search query: from:user1 OR from:user2 ...
    # Twitter API v2 recent search supports max 512 chars query
    # Split into batches if needed
    all_tweets: list[dict] = []

    # Process in batches of 5 usernames to stay within query length limits
    batch_size = 5
    for i in range(0, len(usernames), batch_size):
        batch = usernames[i : i + batch_size]
        query_parts = [f"from:{u}" for u in batch]
        query = f"({' OR '.join(query_parts)}) -is:retweet -is:reply"

        try:
            resp = client.search_recent_tweets(
                query=query,
                max_results=min(limit, 10),
                tweet_fields=["created_at", "author_id", "text"],
                user_fields=["username", "name"],
                expansions=["author_id"],
            )

            if not resp.data:
                continue

            # Build author_id → username map
            user_map = {}
            if resp.includes and "users" in resp.includes:
                for u in resp.includes["users"]:
                    user_map[u.id] = u.username

            for tweet in resp.data:
                username = user_map.get(tweet.author_id, "unknown")
                created = tweet.created_at
                ts = int(created.timestamp()) if created else None
                published_at = created.isoformat() if created else ""

                all_tweets.append({
                    "source": f"@{username}",
                    "title": tweet.text,
                    "url": f"https://x.com/{username}/status/{tweet.id}",
                    "published_at": published_at,
                    "published_ts": ts,
                })
        except tweepy.TooManyRequests:
            logger.warning("Twitter API rate limit hit, using cached data")
            break
        except Exception as e:
            logger.error(f"Twitter API error for batch {batch}: {e}")
            continue

    # Sort by timestamp desc
    all_tweets.sort(key=lambda t: t.get("published_ts") or 0, reverse=True)
    return all_tweets[:limit]


@router.get("/x")
async def get_x_feed(
    limit: Annotated[int, Query(ge=1, le=50)] = 15,
    translate: Annotated[int, Query(ge=0, le=1)] = 1,
):
    """
    X/Twitter feed via Twitter API v2.
    Fetches recent tweets from accounts listed in X_FEED_USERNAMES.
    Falls back to RSS URLs in X_FEED_URLS if configured.
    """
    global _x_feed_cache

    settings = get_settings()
    usernames = [u.strip() for u in settings.X_FEED_USERNAMES.split(",") if u.strip()]

    # Try Twitter API first
    if usernames and settings.TWITTER_BEARER_TOKEN:
        now = time.time()
        # Use cache if fresh
        if _x_feed_cache["items"] and (now - _x_feed_cache["ts"]) < _X_CACHE_TTL:
            raw_items = _x_feed_cache["items"]
        else:
            loop = asyncio.get_event_loop()
            raw_items = await loop.run_in_executor(
                None, lambda: _fetch_x_feed_api_sync(usernames, limit)
            )
            if raw_items:
                _x_feed_cache = {"items": raw_items, "ts": now}

        out = []
        for it in raw_items[:limit]:
            title = it["title"]
            title_ko = await translate_text(title) if translate else title
            out.append({
                "source": it["source"],
                "title": _clamp(title, 280),
                "title_ko": _clamp(title_ko, 280),
                "summary": "",
                "summary_ko": "",
                "url": it["url"],
                "published_at": it["published_at"],
                "published_ts": it["published_ts"],
            })
        return {"items": out, "configured": True}

    # Fallback: RSS URLs
    urls = _split_urls(settings.X_FEED_URLS)
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
    return {"items": out, "configured": bool(urls)}
