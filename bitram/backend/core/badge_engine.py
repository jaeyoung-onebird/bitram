"""
Automatic badge award engine.
Checks user stats against badge criteria and awards new badges.
"""
import logging
from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from db.models import (
    Badge, User, Post, Comment, Follow, Strategy, Bot, Like,
)

logger = logging.getLogger(__name__)


# ─── Badge Criteria Definitions ──────────────────────────────────────────────
# Each entry: key -> { "label": Korean label, "check": callable(stats) -> bool }

BADGE_CRITERIA: dict[str, dict] = {
    "first_post": {
        "label": "첫 발자국",
        "check": lambda stats: stats["post_count"] >= 1,
    },
    "prolific_writer": {
        "label": "활발한 작성자",
        "check": lambda stats: stats["post_count"] >= 50,
    },
    "verified_trader": {
        "label": "인증 트레이더",
        "check": lambda stats: stats["verified_profit_posts"] >= 3,
    },
    "strategy_master": {
        "label": "전략 마스터",
        "check": lambda stats: stats["shared_strategies"] >= 10,
    },
    "top_contributor": {
        "label": "탑 기여자",
        "check": lambda stats: stats["total_likes_received"] >= 100,
    },
    "helpful": {
        "label": "도움왕",
        "check": lambda stats: stats["comment_count"] >= 100,
    },
    "popular": {
        "label": "인기인",
        "check": lambda stats: stats["follower_count"] >= 100,
    },
    "early_adopter": {
        "label": "얼리 어답터",
        "check": lambda stats: (
            stats["account_age_days"] < 90
            and (stats["has_bot"] or stats["has_strategy"] or stats["has_post"])
        ),
    },
}


async def check_and_award_badges(db: AsyncSession, user_id: UUID) -> list[str]:
    """
    Gather user stats, check each badge criterion, and award badges
    that haven't been awarded yet.

    Returns a list of newly awarded badge types.
    """
    # Fetch user
    user = await db.get(User, user_id)
    if not user:
        return []

    # Gather stats
    stats = await _gather_user_stats(db, user_id, user)

    # Get already-awarded badge types
    existing_stmt = select(Badge.type).where(Badge.user_id == user_id)
    existing_result = await db.execute(existing_stmt)
    existing_types: set[str] = {row[0] for row in existing_result.all()}

    newly_awarded: list[str] = []

    for badge_type, criteria in BADGE_CRITERIA.items():
        # Skip if already awarded
        if badge_type in existing_types:
            continue

        # Check criterion
        try:
            if criteria["check"](stats):
                badge = Badge(
                    user_id=user_id,
                    type=badge_type,
                    label=criteria["label"],
                )
                db.add(badge)
                newly_awarded.append(badge_type)
                logger.info(f"Badge awarded: {badge_type} -> user {user_id}")
        except Exception as e:
            logger.warning(f"Error checking badge {badge_type} for user {user_id}: {e}")
            continue

    if newly_awarded:
        await db.commit()

    return newly_awarded


async def _gather_user_stats(db: AsyncSession, user_id: UUID, user: User) -> dict:
    """Gather all stats needed for badge evaluation."""

    # Post count
    post_count = (await db.execute(
        select(func.count()).select_from(Post).where(Post.user_id == user_id)
    )).scalar() or 0

    # Comment count
    comment_count = (await db.execute(
        select(func.count()).select_from(Comment).where(Comment.user_id == user_id)
    )).scalar() or 0

    # Follower count
    follower_count = (await db.execute(
        select(func.count()).select_from(Follow).where(Follow.following_id == user_id)
    )).scalar() or 0

    # Total likes received (sum of like_count on all user's posts)
    total_likes_received = (await db.execute(
        select(func.coalesce(func.sum(Post.like_count), 0)).where(Post.user_id == user_id)
    )).scalar() or 0

    # Shared strategies count (public strategies)
    shared_strategies = (await db.execute(
        select(func.count())
        .select_from(Strategy)
        .where(Strategy.user_id == user_id, Strategy.is_public == True)
    )).scalar() or 0

    # Verified profit posts (posts with verified_profit != null AND verified_profit->verified = true)
    verified_profit_posts = (await db.execute(
        select(func.count())
        .select_from(Post)
        .where(
            Post.user_id == user_id,
            Post.verified_profit.isnot(None),
        )
    )).scalar() or 0

    # Has bot
    has_bot = (await db.execute(
        select(func.count()).select_from(Bot).where(Bot.user_id == user_id)
    )).scalar() or 0
    has_bot = has_bot > 0

    # Has strategy
    has_strategy = (await db.execute(
        select(func.count()).select_from(Strategy).where(Strategy.user_id == user_id)
    )).scalar() or 0
    has_strategy = has_strategy > 0

    # Has post
    has_post = post_count > 0

    # Account age in days
    now = datetime.now(timezone.utc)
    created_at = user.created_at
    if created_at and created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=timezone.utc)
    account_age_days = (now - created_at).days if created_at else 999

    return {
        "post_count": post_count,
        "comment_count": comment_count,
        "follower_count": follower_count,
        "total_likes_received": total_likes_received,
        "shared_strategies": shared_strategies,
        "verified_profit_posts": verified_profit_posts,
        "has_bot": has_bot,
        "has_strategy": has_strategy,
        "has_post": has_post,
        "account_age_days": account_age_days,
    }
