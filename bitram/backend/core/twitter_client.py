"""
BITRAM Twitter Client
Wraps tweepy v2 for posting tweets. Keys are loaded from settings.
"""
import logging
from typing import Optional

import tweepy

from config import get_settings

logger = logging.getLogger(__name__)


class TwitterClient:
    """Thin wrapper around tweepy.Client (Twitter API v2)."""

    def __init__(
        self,
        api_key: str,
        api_secret: str,
        access_token: str,
        access_token_secret: str,
        bearer_token: str = "",
    ):
        self._client = tweepy.Client(
            consumer_key=api_key,
            consumer_secret=api_secret,
            access_token=access_token,
            access_token_secret=access_token_secret,
            bearer_token=bearer_token or None,
            wait_on_rate_limit=True,
        )
        self._enabled = bool(
            api_key and api_secret and access_token and access_token_secret
        )

    @property
    def enabled(self) -> bool:
        return self._enabled

    @staticmethod
    def _weighted_len(text: str) -> int:
        """Twitter counts CJK/Korean chars as 2, URLs as 23."""
        import re
        # Replace URLs with 23-char placeholder for counting
        no_urls = re.sub(r'https?://\S+', 'x' * 23, text)
        return sum(2 if ord(c) > 127 else 1 for c in no_urls)

    @staticmethod
    def _truncate_weighted(text: str, limit: int = 274) -> str:
        """Truncate text to fit Twitter's weighted char limit."""
        import re
        # Find URLs to preserve them
        urls = re.findall(r'https?://\S+', text)
        wlen = TwitterClient._weighted_len(text)
        if wlen <= limit:
            return text
        # Trim from end, character by character
        while wlen > limit and text:
            text = text[:-1]
            wlen = TwitterClient._weighted_len(text)
        return text.rstrip() + "…"

    def post_tweet(self, text: str) -> dict:
        """
        Post a tweet. Returns dict with 'id' and 'text' on success,
        or {'error': str} on failure. Uses Twitter weighted char counting.
        """
        if not self._enabled:
            logger.warning("Twitter client not configured, skipping tweet")
            return {"error": "Twitter API keys not configured", "skipped": True}

        text = self._truncate_weighted(text, 274)
        try:
            response = self._client.create_tweet(text=text)
            tweet_data = response.data
            logger.info(f"Tweet posted: id={tweet_data['id']}")
            return {"id": str(tweet_data["id"]), "text": tweet_data["text"]}
        except tweepy.TweepyException as e:
            logger.error(f"Failed to post tweet: {e}")
            return {"error": str(e)}

    def post_thread(self, texts: list[str]) -> list[dict]:
        """
        Post a thread (multiple tweets chained via in_reply_to_tweet_id).
        Returns list of results for each tweet.
        """
        if not self._enabled:
            return [{"error": "Twitter API keys not configured", "skipped": True}]
        if not texts:
            return []

        results = []
        reply_to_id = None
        for text in texts:
            text = self._truncate_weighted(text, 274)
            try:
                kwargs = {"text": text}
                if reply_to_id:
                    kwargs["in_reply_to_tweet_id"] = reply_to_id
                response = self._client.create_tweet(**kwargs)
                tweet_data = response.data
                tweet_id = str(tweet_data["id"])
                reply_to_id = tweet_id
                results.append({"id": tweet_id, "text": tweet_data["text"]})
                logger.info(f"Thread tweet posted: id={tweet_id}")
            except tweepy.TweepyException as e:
                logger.error(f"Failed to post thread tweet: {e}")
                results.append({"error": str(e)})
                break
        return results

    def delete_tweet(self, tweet_id: str) -> bool:
        if not self._enabled:
            return False
        try:
            self._client.delete_tweet(id=tweet_id)
            return True
        except tweepy.TweepyException as e:
            logger.error(f"Failed to delete tweet {tweet_id}: {e}")
            return False


_twitter_client: Optional[TwitterClient] = None


def get_twitter_client() -> TwitterClient:
    global _twitter_client
    if _twitter_client is None:
        settings = get_settings()
        _twitter_client = TwitterClient(
            api_key=settings.TWITTER_API_KEY,
            api_secret=settings.TWITTER_API_SECRET,
            access_token=settings.TWITTER_ACCESS_TOKEN,
            access_token_secret=settings.TWITTER_ACCESS_TOKEN_SECRET,
            bearer_token=settings.TWITTER_BEARER_TOKEN,
        )
    return _twitter_client
