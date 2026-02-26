"""
Notification background tasks: weekly digest email.
"""
import asyncio
import logging
from datetime import datetime, timedelta, timezone

from tasks.celery_app import app

logger = logging.getLogger(__name__)


@app.task(name="tasks.notification_tasks.send_weekly_digest")
def send_weekly_digest():
    """
    Weekly digest task. For each user with email_weekly_digest=True,
    gather stats for the last 7 days and send a digest email.
    """
    asyncio.run(_send_weekly_digest_async())


async def _send_weekly_digest_async():
    from db.database import AsyncSessionLocal
    from db.models import (
        User, UserNotificationPreference, Follow, Like, Comment, Post,
    )
    from sqlalchemy import select, func

    seven_days_ago = datetime.now(timezone.utc) - timedelta(days=7)

    async with AsyncSessionLocal() as db:
        # Find all users who have email_weekly_digest enabled
        stmt = (
            select(User, UserNotificationPreference)
            .join(
                UserNotificationPreference,
                UserNotificationPreference.user_id == User.id,
            )
            .where(
                UserNotificationPreference.email_weekly_digest == True,
                User.is_active == True,
                User.email_verified == True,
            )
        )
        result = await db.execute(stmt)
        rows = result.all()

        for user, prefs in rows:
            try:
                stats = await _gather_weekly_stats(db, user.id, seven_days_ago)

                # Skip if no activity
                if all(v == 0 for v in stats.values()):
                    continue

                # Dispatch email task
                from tasks.email_tasks import send_weekly_digest_email_task
                send_weekly_digest_email_task.delay(
                    to=user.email,
                    nickname=user.nickname,
                    stats=stats,
                )
                logger.info(f"Weekly digest queued for {user.email}")

            except Exception as e:
                logger.error(f"Error processing weekly digest for user {user.id}: {e}")
                continue


async def _gather_weekly_stats(db, user_id, since: datetime) -> dict:
    """Gather weekly activity stats for a user."""
    from db.models import Follow, Like, Comment, Post
    from sqlalchemy import select, func

    # New followers in last 7 days
    new_followers = (await db.execute(
        select(func.count())
        .select_from(Follow)
        .where(
            Follow.following_id == user_id,
            Follow.created_at >= since,
        )
    )).scalar() or 0

    # Likes received on user's posts in last 7 days
    # Get user's post IDs first, then count likes on them
    user_post_ids_stmt = select(Post.id).where(Post.user_id == user_id)
    user_post_ids = [row[0] for row in (await db.execute(user_post_ids_stmt)).all()]

    likes_received = 0
    if user_post_ids:
        likes_received = (await db.execute(
            select(func.count())
            .select_from(Like)
            .where(
                Like.target_type == "post",
                Like.target_id.in_(user_post_ids),
                Like.created_at >= since,
            )
        )).scalar() or 0

    # Comments received on user's posts in last 7 days
    comments_received = 0
    if user_post_ids:
        comments_received = (await db.execute(
            select(func.count())
            .select_from(Comment)
            .where(
                Comment.post_id.in_(user_post_ids),
                Comment.user_id != user_id,
                Comment.created_at >= since,
            )
        )).scalar() or 0

    return {
        "new_followers": new_followers,
        "likes_received": likes_received,
        "comments_received": comments_received,
    }
