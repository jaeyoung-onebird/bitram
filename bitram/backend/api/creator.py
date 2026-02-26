"""
Creator Program: auto-detect and reward top content creators.
Criteria: post count, total likes, strategy copies, follower count.
Tiers: Bronze Creator (score >= 100), Silver Creator (>= 500), Gold Creator (>= 2000), Platinum Creator (>= 10000)
"""
import json
import logging
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from db.database import get_db
from db.models import User, Post, Strategy, Follow, UserPoints, Badge
from api.deps import get_current_user
from core.redis_cache import cache_get, cache_set, get_redis
from core.points import award_points, compute_level

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/creator", tags=["creator"])

KST = timezone(timedelta(hours=9))

# ─── Tier definitions ────────────────────────────────────────────────────────

TIERS = [
    {
        "name": "Platinum Creator",
        "key": "platinum",
        "min_score": 10000,
        "badge_type": "platinum_creator",
        "badge_label": "플래티넘 크리에이터",
        "monthly_points": 3000,
        "extra_bots": 5,
        "perks": ["플래티넘 크리에이터 뱃지", "월 3,000 포인트", "+5 추가 봇", "프로필 고정 노출", "프리미엄 플랜 무료"],
    },
    {
        "name": "Gold Creator",
        "key": "gold",
        "min_score": 2000,
        "badge_type": "gold_creator",
        "badge_label": "골드 크리에이터",
        "monthly_points": 1000,
        "extra_bots": 2,
        "perks": ["골드 크리에이터 뱃지", "월 1,000 포인트", "+2 추가 봇", "프로필 추천 노출"],
    },
    {
        "name": "Silver Creator",
        "key": "silver",
        "min_score": 500,
        "badge_type": "silver_creator",
        "badge_label": "실버 크리에이터",
        "monthly_points": 300,
        "extra_bots": 0,
        "perks": ["실버 크리에이터 뱃지", "월 300 포인트", "댓글 하이라이트"],
    },
    {
        "name": "Bronze Creator",
        "key": "bronze",
        "min_score": 100,
        "badge_type": "creator",
        "badge_label": "크리에이터",
        "monthly_points": 100,
        "extra_bots": 0,
        "perks": ["크리에이터 뱃지", "월 100 포인트"],
    },
]

# All tiers for display (ascending order)
ALL_TIERS = list(reversed(TIERS))


def _get_tier(score: int) -> dict | None:
    """Return the highest matching tier for a given score, or None."""
    for tier in TIERS:  # TIERS is sorted desc by min_score
        if score >= tier["min_score"]:
            return tier
    return None


def _next_tier(score: int) -> dict | None:
    """Return the next tier above current score, or None if already at max."""
    for tier in reversed(TIERS):  # ascending order
        if score < tier["min_score"]:
            return tier
    return None


async def _compute_creator_score(db: AsyncSession, user_id) -> dict:
    """Compute creator score components for a user."""
    # Post count
    post_count_q = await db.execute(
        select(func.count()).select_from(Post).where(Post.user_id == user_id)
    )
    post_count = post_count_q.scalar() or 0

    # Total likes received on all posts
    total_likes_q = await db.execute(
        select(func.coalesce(func.sum(Post.like_count), 0)).where(Post.user_id == user_id)
    )
    total_likes = int(total_likes_q.scalar() or 0)

    # Strategy copy count (sum of copy_count on user's strategies)
    copy_count_q = await db.execute(
        select(func.coalesce(func.sum(Strategy.copy_count), 0)).where(Strategy.user_id == user_id)
    )
    strategy_copy_count = int(copy_count_q.scalar() or 0)

    # Follower count
    follower_count_q = await db.execute(
        select(func.count()).select_from(Follow).where(Follow.following_id == user_id)
    )
    follower_count = follower_count_q.scalar() or 0

    score = (
        (post_count * 5)
        + (total_likes * 2)
        + (strategy_copy_count * 10)
        + (follower_count * 3)
    )

    return {
        "post_count": post_count,
        "total_likes": total_likes,
        "strategy_copy_count": strategy_copy_count,
        "follower_count": follower_count,
        "score": score,
    }


# ─── Endpoints ────────────────────────────────────────────────────────────────


@router.get("/status")
async def get_creator_status(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Returns current user's creator status (tier, score, perks)."""
    components = await _compute_creator_score(db, user.id)
    score = components["score"]
    tier = _get_tier(score)
    next_t = _next_tier(score)

    # Check if already claimed this month
    now_kst = datetime.now(KST)
    claim_key = f"creator:claimed:{user.id}:{now_kst.year}-{now_kst.month:02d}"
    claimed_this_month = False
    try:
        r = await get_redis()
        claimed_this_month = bool(await r.exists(claim_key))
    except Exception:
        pass

    return {
        "score": score,
        "components": components,
        "tier": {
            "name": tier["name"],
            "key": tier["key"],
            "badge_type": tier["badge_type"],
            "monthly_points": tier["monthly_points"],
            "extra_bots": tier["extra_bots"],
            "perks": tier["perks"],
        } if tier else None,
        "next_tier": {
            "name": next_t["name"],
            "key": next_t["key"],
            "min_score": next_t["min_score"],
            "points_needed": next_t["min_score"] - score,
        } if next_t else None,
        "all_tiers": [
            {"name": t["name"], "key": t["key"], "min_score": t["min_score"], "perks": t["perks"]}
            for t in ALL_TIERS
        ],
        "claimed_this_month": claimed_this_month,
    }


@router.get("/top")
async def get_top_creators(
    db: AsyncSession = Depends(get_db),
):
    """Returns top 20 creators (public, cached 10min)."""
    cached = await cache_get("creator:top20")
    if cached:
        return cached

    # Build a subquery for each component
    # We compute per-user: post_count, total_likes, strategy_copy_count, follower_count
    # Then compute score and sort

    # Get all users with at least 1 post or 1 follower
    users_q = await db.execute(
        select(User.id, User.nickname, User.avatar_url).where(User.is_active == True)  # noqa: E712
    )
    all_users = users_q.all()

    results = []
    for uid, nickname, avatar_url in all_users:
        components = await _compute_creator_score(db, uid)
        if components["score"] < 10:  # Skip trivial scores
            continue
        tier = _get_tier(components["score"])
        results.append({
            "user_id": str(uid),
            "nickname": nickname,
            "avatar_url": avatar_url,
            "score": components["score"],
            "post_count": components["post_count"],
            "total_likes": components["total_likes"],
            "strategy_copy_count": components["strategy_copy_count"],
            "follower_count": components["follower_count"],
            "tier": tier["key"] if tier else None,
            "tier_name": tier["name"] if tier else None,
        })

    results.sort(key=lambda x: x["score"], reverse=True)
    top20 = results[:20]

    # Add rank
    for i, item in enumerate(top20, 1):
        item["rank"] = i

    await cache_set("creator:top20", top20, ttl=600)
    return top20


@router.post("/claim")
async def claim_creator_reward(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Claim monthly creator rewards (points based on tier)."""
    components = await _compute_creator_score(db, user.id)
    score = components["score"]
    tier = _get_tier(score)

    if not tier:
        return {"ok": False, "message": "크리에이터 등급에 도달하지 못했습니다. (최소 100점 필요)"}

    # Check if already claimed this month
    now_kst = datetime.now(KST)
    claim_key = f"creator:claimed:{user.id}:{now_kst.year}-{now_kst.month:02d}"

    try:
        r = await get_redis()
        already_claimed = await r.exists(claim_key)
        if already_claimed:
            return {"ok": False, "message": "이번 달 크리에이터 보상을 이미 수령했습니다."}
    except Exception as e:
        logger.warning(f"Redis check failed: {e}")
        return {"ok": False, "message": "일시적 오류가 발생했습니다. 잠시 후 다시 시도해주세요."}

    monthly_points = tier["monthly_points"]

    # Award points directly (use manual point awarding since this is a custom action)
    stmt = select(UserPoints).where(UserPoints.user_id == user.id)
    result = await db.execute(stmt)
    user_points = result.scalar_one_or_none()

    if not user_points:
        user_points = UserPoints(user_id=user.id, total_points=0, level=1, login_streak=0)
        db.add(user_points)
        await db.flush()

    user_points.total_points = (user_points.total_points or 0) + monthly_points
    user_points.level = compute_level(user_points.total_points)
    user_points.updated_at = datetime.now(timezone.utc)

    # Log the point award
    from db.models import PointLog
    log = PointLog(
        user_id=user.id,
        action="creator_reward",
        points=monthly_points,
        description=f"{tier['name']} 월간 크리에이터 보상 ({now_kst.year}년 {now_kst.month}월)",
    )
    db.add(log)

    # Award/upgrade creator badge
    badge_stmt = select(Badge).where(Badge.user_id == user.id, Badge.type == tier["badge_type"])
    badge_result = await db.execute(badge_stmt)
    existing_badge = badge_result.scalar_one_or_none()

    if not existing_badge:
        # Remove any lower-tier creator badges
        for t in TIERS:
            if t["key"] != tier["key"]:
                del_stmt = select(Badge).where(Badge.user_id == user.id, Badge.type == t["badge_type"])
                del_result = await db.execute(del_stmt)
                old_badge = del_result.scalar_one_or_none()
                if old_badge:
                    await db.delete(old_badge)

        new_badge = Badge(
            user_id=user.id,
            type=tier["badge_type"],
            label=tier["badge_label"],
        )
        db.add(new_badge)

    await db.commit()

    # Mark as claimed in Redis (35-day TTL)
    try:
        r = await get_redis()
        await r.setex(claim_key, 35 * 86400, "1")
    except Exception as e:
        logger.warning(f"Redis setex failed: {e}")

    return {
        "ok": True,
        "message": f"{tier['name']} 크리에이터 보상 {monthly_points}P를 수령했습니다!",
        "points_awarded": monthly_points,
        "tier": tier["name"],
    }
