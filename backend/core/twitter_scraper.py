"""
Twitter/X 비공식 스크래퍼 - auth_token 쿠키 기반.

auth_token 쿠키를 사용하여 Twitter 내부 GraphQL API로 트윗을 가져옵니다.
ct0(CSRF) 토큰은 자동으로 발급받습니다.
"""
from __future__ import annotations

import json
import logging
import time
import urllib.parse
from dataclasses import dataclass, field
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

# Twitter 웹 클라이언트의 공개 Bearer 토큰 (모든 유저 공통, 웹 JS에 내장)
_BEARER = (
    "AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs"
    "%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA"
)

_BASE_HEADERS = {
    "Authorization": f"Bearer {_BEARER}",
    "Content-Type": "application/json",
    "X-Twitter-Active-User": "yes",
    "X-Twitter-Auth-Type": "OAuth2Session",
    "X-Twitter-Client-Language": "en",
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/131.0.0.0 Safari/537.36"
    ),
}

# GraphQL features 플래그 (Twitter가 요구)
_FEATURES = {
    "rweb_tipjar_consumption_enabled": True,
    "responsive_web_graphql_exclude_directive_enabled": True,
    "verified_phone_label_enabled": False,
    "creator_subscriptions_tweet_preview_api_enabled": True,
    "responsive_web_graphql_timeline_navigation_enabled": True,
    "responsive_web_graphql_skip_user_profile_image_extensions_enabled": False,
    "communities_web_enable_tweet_community_results_fetch": True,
    "c9s_tweet_anatomy_moderator_badge_enabled": True,
    "articles_preview_enabled": True,
    "responsive_web_edit_tweet_api_enabled": True,
    "tweetypie_unmention_optimization_enabled": True,
    "tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled": True,
    "responsive_web_media_download_video_enabled": False,
    "longform_notetweets_inline_media_enabled": True,
    "responsive_web_enhance_cards_enabled": False,
    "longform_notetweets_rich_text_read_enabled": True,
    "longform_notetweets_consumption_enabled": True,
    "responsive_web_twitter_article_tweet_consumption_enabled": True,
    "freedom_of_speech_not_reach_fetch_enabled": True,
    "standardized_nudges_misinfo": True,
    "tweet_awards_web_tipping_enabled": False,
    "view_counts_everywhere_api_enabled": True,
}

# 캐시: 5분 TTL
_cache: dict[str, tuple[float, list[dict]]] = {}
_CACHE_TTL = 300  # 5분

# ct0 토큰 캐시
_ct0_cache: dict[str, tuple[float, str]] = {}
_CT0_TTL = 3600  # 1시간

# user_id 캐시 (screen_name -> rest_id)
_uid_cache: dict[str, str] = {}


@dataclass
class ScrapedTweet:
    tweet_id: str
    text: str
    author_name: str
    author_username: str
    created_at: str  # Twitter 형식 "Thu Jan 01 00:00:00 +0000 2025"
    url: str
    published_ts: Optional[float] = None


async def _get_ct0(client: httpx.AsyncClient, auth_token: str) -> str:
    """auth_token으로 x.com에 접속하여 ct0 CSRF 토큰을 받아온다."""
    cached = _ct0_cache.get(auth_token)
    if cached and (time.time() - cached[0]) < _CT0_TTL:
        return cached[1]

    client.cookies.set("auth_token", auth_token, domain=".x.com")
    resp = await client.get(
        "https://x.com",
        follow_redirects=True,
        headers={
            "User-Agent": _BASE_HEADERS["User-Agent"],
        },
    )
    ct0 = client.cookies.get("ct0", domain=".x.com") or ""
    if not ct0:
        # Set-Cookie에서 직접 추출
        for h in resp.headers.get_list("set-cookie"):
            if "ct0=" in h:
                ct0 = h.split("ct0=")[1].split(";")[0]
                break
    if ct0:
        _ct0_cache[auth_token] = (time.time(), ct0)
        logger.info("Twitter ct0 token acquired")
    else:
        logger.warning("Failed to acquire ct0 token from Twitter")
    return ct0


async def _graphql_get(
    client: httpx.AsyncClient,
    auth_token: str,
    ct0: str,
    query_id: str,
    operation: str,
    variables: dict,
) -> dict:
    """Twitter GraphQL GET 요청."""
    client.cookies.set("auth_token", auth_token, domain=".x.com")
    client.cookies.set("ct0", ct0, domain=".x.com")

    params = {
        "variables": json.dumps(variables, separators=(",", ":")),
        "features": json.dumps(_FEATURES, separators=(",", ":")),
    }
    url = f"https://x.com/i/api/graphql/{query_id}/{operation}?{urllib.parse.urlencode(params, safe=':,')}"

    headers = {
        **_BASE_HEADERS,
        "X-Csrf-Token": ct0,
    }

    resp = await client.get(url, headers=headers, follow_redirects=True, timeout=15)
    if resp.status_code != 200:
        logger.error("Twitter GraphQL %s returned %s: %s", operation, resp.status_code, resp.text[:300])
        return {}
    return resp.json()


async def _resolve_user_id(
    client: httpx.AsyncClient, auth_token: str, ct0: str, screen_name: str
) -> Optional[str]:
    """screen_name → 숫자 user_id."""
    if screen_name in _uid_cache:
        return _uid_cache[screen_name]

    # UserByScreenName queryId - 이 값은 주기적으로 변할 수 있음
    query_id = "xmU6X_CKVnQ5lSrCbAmJsg"
    variables = {
        "screen_name": screen_name,
        "withSafetyModeUserFields": True,
    }
    data = await _graphql_get(client, auth_token, ct0, query_id, "UserByScreenName", variables)
    try:
        uid = data["data"]["user"]["result"]["rest_id"]
        _uid_cache[screen_name] = uid
        return uid
    except (KeyError, TypeError):
        logger.warning("Failed to resolve user_id for @%s", screen_name)
        return None


def _parse_tweets(data: dict) -> list[ScrapedTweet]:
    """GraphQL 응답에서 트윗 목록 파싱."""
    tweets: list[ScrapedTweet] = []
    try:
        instructions = (
            data.get("data", {})
            .get("user", {})
            .get("result", {})
            .get("timeline_v2", {})
            .get("timeline", {})
            .get("instructions", [])
        )
    except (AttributeError, TypeError):
        return tweets

    for instr in instructions:
        if instr.get("type") != "TimelineAddEntries":
            continue
        for entry in instr.get("entries", []):
            try:
                content = entry.get("content", {})
                item_content = content.get("itemContent") or content.get("entryType", "")
                if not isinstance(item_content, dict):
                    continue

                tweet_result = item_content.get("tweet_results", {}).get("result", {})

                # 프로모션/광고 건너뛰기
                if tweet_result.get("__typename") == "TweetWithVisibilityResults":
                    tweet_result = tweet_result.get("tweet", {})

                legacy = tweet_result.get("legacy", {})
                if not legacy.get("full_text"):
                    continue

                # 리트윗 건너뛰기 (원하면 주석 해제)
                if legacy.get("retweeted_status_result"):
                    continue

                core = tweet_result.get("core", {}).get("user_results", {}).get("result", {})
                user_legacy = core.get("legacy", {})

                screen_name = user_legacy.get("screen_name", "")
                tweet_id = legacy.get("id_str") or tweet_result.get("rest_id", "")

                # timestamp 파싱
                created_at = legacy.get("created_at", "")
                published_ts = None
                if created_at:
                    try:
                        from email.utils import parsedate_to_datetime
                        dt = parsedate_to_datetime(created_at)
                        published_ts = dt.timestamp()
                    except Exception:
                        pass

                tweets.append(
                    ScrapedTweet(
                        tweet_id=tweet_id,
                        text=legacy["full_text"],
                        author_name=user_legacy.get("name", screen_name),
                        author_username=screen_name,
                        created_at=created_at,
                        url=f"https://x.com/{screen_name}/status/{tweet_id}",
                        published_ts=published_ts,
                    )
                )
            except Exception as e:
                logger.debug("Tweet parse error: %s", e)
                continue

    return tweets


async def fetch_user_tweets(
    auth_token: str,
    screen_name: str,
    count: int = 20,
) -> list[ScrapedTweet]:
    """특정 유저의 최근 트윗을 가져온다."""
    cache_key = f"user:{screen_name}:{count}"
    cached = _cache.get(cache_key)
    if cached and (time.time() - cached[0]) < _CACHE_TTL:
        return cached[1]

    async with httpx.AsyncClient() as client:
        ct0 = await _get_ct0(client, auth_token)
        if not ct0:
            logger.error("Cannot fetch tweets: no ct0 token")
            return []

        user_id = await _resolve_user_id(client, auth_token, ct0, screen_name)
        if not user_id:
            return []

        # UserTweets queryId
        query_id = "E3opETHurmVJflFsUBVuUQ"
        variables = {
            "userId": user_id,
            "count": count,
            "includePromotedContent": False,
            "withQuickPromoteEligibilityTweetFields": True,
            "withVoice": True,
            "withV2Timeline": True,
        }
        data = await _graphql_get(client, auth_token, ct0, query_id, "UserTweets", variables)

    tweets = _parse_tweets(data)
    _cache[cache_key] = (time.time(), tweets)
    return tweets


async def fetch_multiple_users_tweets(
    auth_token: str,
    usernames: list[str],
    per_user: int = 5,
    total_limit: int = 30,
) -> list[ScrapedTweet]:
    """여러 유저의 트윗을 가져와서 시간순으로 합친다."""
    cache_key = f"multi:{','.join(sorted(usernames))}:{per_user}:{total_limit}"
    cached = _cache.get(cache_key)
    if cached and (time.time() - cached[0]) < _CACHE_TTL:
        return cached[1]

    all_tweets: list[ScrapedTweet] = []

    async with httpx.AsyncClient() as client:
        ct0 = await _get_ct0(client, auth_token)
        if not ct0:
            logger.error("Cannot fetch tweets: no ct0 token")
            return []

        for username in usernames:
            try:
                user_id = await _resolve_user_id(client, auth_token, ct0, username)
                if not user_id:
                    continue

                query_id = "E3opETHurmVJflFsUBVuUQ"
                variables = {
                    "userId": user_id,
                    "count": per_user,
                    "includePromotedContent": False,
                    "withQuickPromoteEligibilityTweetFields": True,
                    "withVoice": True,
                    "withV2Timeline": True,
                }
                data = await _graphql_get(client, auth_token, ct0, query_id, "UserTweets", variables)
                tweets = _parse_tweets(data)
                all_tweets.extend(tweets[:per_user])
            except Exception as e:
                logger.warning("Failed to fetch tweets for @%s: %s", username, e)
                continue

    # 시간순 정렬 (최신 먼저)
    all_tweets.sort(key=lambda t: t.published_ts or 0, reverse=True)
    result = all_tweets[:total_limit]
    _cache[cache_key] = (time.time(), result)
    return result
