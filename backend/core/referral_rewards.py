"""
Referral milestone rewards: ongoing rewards for referrers based on referred user activity.
"""
import logging
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from uuid import UUID

from db.models import Referral, Post, UserPoints

logger = logging.getLogger(__name__)


# Milestone definitions: (milestone_key, description, points_to_award, check_function_name)
REFERRAL_MILESTONES = {
    "first_post": {
        "description": "추천인의 첫 게시글 작성",
        "points": 20,
    },
    "level_2": {
        "description": "추천인이 레벨 2 달성",
        "points": 50,
    },
}


async def check_referral_milestones(db: AsyncSession, user_id) -> None:
    """
    Check if this user's activity triggers rewards for their referrer.
    Called after significant user actions (posting, leveling up, etc.).

    Finds the referral record where referred_id = user_id,
    checks milestones: first_post, level_2.
    Awards points to referrer if milestone not already awarded.
    """
    from core.points import award_points, compute_level

    # Find referral record where this user was referred
    stmt = select(Referral).where(Referral.referred_id == user_id)
    result = await db.execute(stmt)
    referral = result.scalar_one_or_none()

    if not referral:
        return  # User was not referred by anyone

    milestones = referral.milestones_json or {}

    # ─── Milestone: first_post ─────────────────────────────────────────
    if "first_post" not in milestones:
        post_count_result = await db.execute(
            select(func.count()).select_from(Post).where(Post.user_id == user_id)
        )
        post_count = post_count_result.scalar() or 0
        if post_count >= 1:
            try:
                await award_points(
                    db, referral.referrer_id,
                    "referral_milestone",
                    f"추천인 첫 게시글 작성 보너스 (+{REFERRAL_MILESTONES['first_post']['points']})"
                )
            except Exception:
                pass
            milestones["first_post"] = True

    # ─── Milestone: level_2 ────────────────────────────────────────────
    if "level_2" not in milestones:
        up_result = await db.execute(
            select(UserPoints).where(UserPoints.user_id == user_id)
        )
        up = up_result.scalar_one_or_none()
        if up:
            level, _ = compute_level(up.total_points or 0)
            if level >= 2:
                try:
                    await award_points(
                        db, referral.referrer_id,
                        "referral_milestone",
                        f"추천인 레벨 2 달성 보너스 (+{REFERRAL_MILESTONES['level_2']['points']})"
                    )
                except Exception:
                    pass
                milestones["level_2"] = True

    # Update milestones in the referral record
    referral.milestones_json = milestones
    await db.flush()
