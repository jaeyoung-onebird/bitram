"""
Admin API for Twitter bot monitoring.
View tweet history, stats, and manually trigger tweets.
"""
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import get_current_admin
from db.database import get_db
from db.models import TweetLog, User

router = APIRouter(prefix="/api/admin/twitter", tags=["admin-twitter"])


@router.get("/tweets")
async def list_tweets(
    _admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
    status: Optional[str] = Query(None),
    content_type: Optional[str] = Query(None),
    limit: int = Query(20, le=100),
    offset: int = Query(0),
):
    """List recent tweets with pagination."""
    stmt = select(TweetLog).order_by(TweetLog.created_at.desc())
    if status:
        stmt = stmt.where(TweetLog.status == status)
    if content_type:
        stmt = stmt.where(TweetLog.content_type == content_type)
    stmt = stmt.offset(offset).limit(limit)

    result = await db.execute(stmt)
    tweets = result.scalars().all()

    count_stmt = select(func.count()).select_from(TweetLog)
    if status:
        count_stmt = count_stmt.where(TweetLog.status == status)
    if content_type:
        count_stmt = count_stmt.where(TweetLog.content_type == content_type)
    total = (await db.execute(count_stmt)).scalar_one()

    return {
        "total": total,
        "tweets": [
            {
                "id": str(t.id),
                "content_type": t.content_type,
                "content": t.content,
                "tweet_id": t.tweet_id,
                "status": t.status,
                "error_message": t.error_message,
                "created_at": str(t.created_at),
            }
            for t in tweets
        ],
    }


@router.get("/stats")
async def tweet_stats(
    _admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Aggregate stats for the Twitter bot."""
    now = datetime.now(timezone.utc)
    d7 = now - timedelta(days=7)
    d30 = now - timedelta(days=30)

    total = (await db.execute(
        select(func.count()).select_from(TweetLog)
    )).scalar_one()

    posted = (await db.execute(
        select(func.count()).select_from(TweetLog)
        .where(TweetLog.status == "posted")
    )).scalar_one()

    failed = (await db.execute(
        select(func.count()).select_from(TweetLog)
        .where(TweetLog.status == "failed")
    )).scalar_one()

    last_7d = (await db.execute(
        select(func.count()).select_from(TweetLog)
        .where(TweetLog.created_at >= d7, TweetLog.status == "posted")
    )).scalar_one()

    # Breakdown by content type (last 30 days)
    type_stmt = (
        select(TweetLog.content_type, func.count())
        .where(TweetLog.created_at >= d30)
        .group_by(TweetLog.content_type)
    )
    by_type = {row[0]: row[1] for row in (await db.execute(type_stmt)).all()}

    # Last tweet
    last_tweet = (await db.execute(
        select(TweetLog)
        .where(TweetLog.status == "posted")
        .order_by(TweetLog.created_at.desc())
        .limit(1)
    )).scalar_one_or_none()

    return {
        "total": total,
        "posted": posted,
        "failed": failed,
        "last_7d_posted": last_7d,
        "by_content_type_30d": by_type,
        "last_tweet": {
            "content": last_tweet.content if last_tweet else None,
            "created_at": str(last_tweet.created_at) if last_tweet else None,
            "tweet_id": last_tweet.tweet_id if last_tweet else None,
        },
    }
