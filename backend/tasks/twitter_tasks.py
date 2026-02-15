"""
Celery tasks for automated Twitter posting.
"""
import asyncio
import logging

from tasks.celery_app import app as celery_app

logger = logging.getLogger(__name__)


def _run_async(coro):
    """Bridge async coroutines for Celery (matches email_tasks.py pattern)."""
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


@celery_app.task(name="tasks.twitter_tasks.post_scheduled_tweet")
def post_scheduled_tweet():
    """
    Main scheduled task: generate content and post a tweet.
    Called by Celery Beat on schedule.
    """
    from config import get_settings

    settings = get_settings()
    if not settings.TWITTER_BOT_ENABLED:
        logger.info("Twitter bot disabled, skipping scheduled tweet")
        return

    _run_async(_post_tweet_async())


async def _post_tweet_async():
    from db.database import AsyncSessionLocal
    from db.models import TweetLog
    from sqlalchemy import select
    from core.tweet_content import pick_content_type, generate_tweet_content
    from core.twitter_client import get_twitter_client

    twitter = get_twitter_client()

    async with AsyncSessionLocal() as db:
        # Get recent tweet types for dedup
        recent_stmt = (
            select(TweetLog.content_type)
            .order_by(TweetLog.created_at.desc())
            .limit(3)
        )
        recent_result = await db.execute(recent_stmt)
        recent_types = [r[0] for r in recent_result.all()]

        # Pick content type and generate
        content_type = pick_content_type(recent_types)
        final_type, tweet_text = await generate_tweet_content(
            content_type, db=db,
        )

        if not tweet_text:
            logger.warning("No tweet content generated, skipping")
            return

        # Post the tweet
        result = twitter.post_tweet(tweet_text)

        # Log to database
        if "id" in result:
            status = "posted"
        elif result.get("skipped"):
            status = "skipped"
        else:
            status = "failed"

        tweet_log = TweetLog(
            content_type=final_type,
            content=tweet_text,
            tweet_id=result.get("id"),
            status=status,
            error_message=result.get("error"),
        )
        db.add(tweet_log)
        await db.commit()

        logger.info(f"Tweet {status}: type={final_type}, id={result.get('id', 'N/A')}")
