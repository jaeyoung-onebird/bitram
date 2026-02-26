"""
Points & Level system core logic.
"""
import logging
from datetime import datetime, timezone, timedelta, date
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from db.models import UserPoints, PointLog

logger = logging.getLogger(__name__)

KST = timezone(timedelta(hours=9))

LEVEL_THRESHOLDS = [
    (0, "석탄", 1),
    (50, "아이언", 2),
    (200, "브론즈", 3),
    (500, "실버", 4),
    (1000, "골드", 5),
    (2000, "플래티넘", 6),
    (5000, "사파이어", 7),
    (10000, "루비", 8),
    (20000, "에메랄드", 9),
    (50000, "다이아몬드", 10),
]

POINT_VALUES = {
    "login": 5,
    "post": 20,
    "comment": 5,
    "like_received": 2,
    "strategy_shared": 30,
    "strategy_copied": 10,
    "first_backtest": 50,
    "referral_inviter": 100,
    "referral_invitee": 50,
    "profit_shared": 25,
    # New point events
    "login_streak_7": 50,
    "login_streak_30": 200,
    "first_bot": 50,
    "first_post": 30,
    "backtest_run": 5,
    "marketplace_copy": 10,
    "follower_milestone_10": 100,
    "follower_milestone_50": 300,
    "follower_milestone_100": 500,
    "follower_milestone_500": 1000,
    "follower_milestone_1000": 2000,
    "referral_milestone": 20,  # Base value; actual amount varies by milestone
}

# Follower milestones: (threshold, action_key)
FOLLOWER_MILESTONES = [
    (10, "follower_milestone_10"),
    (50, "follower_milestone_50"),
    (100, "follower_milestone_100"),
    (500, "follower_milestone_500"),
    (1000, "follower_milestone_1000"),
]

# Daily limits for repeatable actions: action -> max per day
DAILY_LIMITS = {
    "backtest_run": 3,
    "marketplace_copy": 1,
    "strategy_shared": 1,
}

# One-time events (only awarded once per user)
ONE_TIME_EVENTS = {
    "first_backtest", "first_bot", "first_post",
    "login_streak_7", "login_streak_30",
    "follower_milestone_10", "follower_milestone_50",
    "follower_milestone_100", "follower_milestone_500",
    "follower_milestone_1000",
}


def compute_level(total_points: int) -> tuple[int, str]:
    """Returns (level_number, level_name) for a given point total."""
    level_num = 1
    level_name = "석탄"
    for threshold, name, num in LEVEL_THRESHOLDS:
        if total_points >= threshold:
            level_num = num
            level_name = name
    return level_num, level_name


def next_level_info(total_points: int) -> dict:
    """Returns info about the next level."""
    for i, (threshold, name, num) in enumerate(LEVEL_THRESHOLDS):
        if total_points < threshold:
            return {
                "next_level": num,
                "next_level_name": name,
                "points_needed": threshold - total_points,
                "next_threshold": threshold,
            }
    return {
        "next_level": None,
        "next_level_name": None,
        "points_needed": 0,
        "next_threshold": None,
    }


async def award_points(
    db: AsyncSession,
    user_id,
    action: str,
    description: str = "",
):
    """Award points to a user. Get-or-create UserPoints, add points, update level, log."""
    points = POINT_VALUES.get(action)
    if not points:
        logger.warning(f"Unknown point action: {action}")
        return None

    # Get or create UserPoints
    stmt = select(UserPoints).where(UserPoints.user_id == user_id)
    result = await db.execute(stmt)
    user_points = result.scalar_one_or_none()

    if not user_points:
        user_points = UserPoints(user_id=user_id, total_points=0, level=1, login_streak=0)
        db.add(user_points)
        await db.flush()

    now_kst = datetime.now(KST)
    today_kst = now_kst.date()

    # For login, check if already awarded today (KST)
    if action == "login":
        if user_points.last_login_bonus:
            last_bonus_kst = user_points.last_login_bonus.astimezone(KST).date() if user_points.last_login_bonus.tzinfo else user_points.last_login_bonus.date()
            if last_bonus_kst == today_kst:
                return user_points
            # Update streak
            yesterday_kst = today_kst - timedelta(days=1)
            if last_bonus_kst == yesterday_kst:
                user_points.login_streak = (user_points.login_streak or 0) + 1
            else:
                user_points.login_streak = 1
        else:
            user_points.login_streak = 1
        user_points.last_login_bonus = now_kst
        user_points.last_login_date = today_kst

    # One-time events: check if already awarded
    if action in ONE_TIME_EVENTS:
        stmt = select(PointLog).where(
            PointLog.user_id == user_id, PointLog.action == action
        )
        result = await db.execute(stmt)
        if result.scalar_one_or_none():
            return user_points

    # Daily-limited events
    if action in DAILY_LIMITS:
        limit = DAILY_LIMITS[action]
        start_of_day_kst = datetime.combine(today_kst, datetime.min.time()).replace(tzinfo=KST)
        stmt = select(func.count()).select_from(PointLog).where(
            PointLog.user_id == user_id,
            PointLog.action == action,
            PointLog.created_at >= start_of_day_kst,
        )
        result = await db.execute(stmt)
        count = result.scalar() or 0
        if count >= limit:
            return user_points

    # Add points
    user_points.total_points = (user_points.total_points or 0) + points
    level_num, level_name = compute_level(user_points.total_points)
    user_points.level = level_num
    user_points.updated_at = datetime.now(timezone.utc)

    # Log
    log = PointLog(
        user_id=user_id,
        action=action,
        points=points,
        description=description or action,
    )
    db.add(log)

    # Check and award badges after points change
    try:
        from core.badge_engine import check_and_award_badges
        await check_and_award_badges(db, user_id)
    except Exception as e:
        logger.warning(f"Badge check failed for user {user_id}: {e}")

    return user_points


async def check_and_award_streak(db: AsyncSession, user_id):
    """Check login streak milestones and award bonus points."""
    stmt = select(UserPoints).where(UserPoints.user_id == user_id)
    result = await db.execute(stmt)
    user_points = result.scalar_one_or_none()
    if not user_points:
        return

    streak = user_points.login_streak or 0
    if streak >= 7:
        await award_points(db, user_id, "login_streak_7", "7일 연속 로그인 보너스")
    if streak >= 30:
        await award_points(db, user_id, "login_streak_30", "30일 연속 로그인 보너스")
