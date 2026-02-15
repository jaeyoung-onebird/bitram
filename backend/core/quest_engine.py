"""
Daily Quest Engine: defines quests and computes progress from existing data.
"""
from datetime import datetime, timezone, timedelta, date
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from db.models import Post, Comment, Like, Attendance, PointLog, QuestClaim

KST = timezone(timedelta(hours=9))

DAILY_QUESTS = [
    {
        "id": "write_post",
        "title": "글 작성하기",
        "description": "게시글 1개 작성",
        "target": 1,
        "points": 20,
        "type": "post",
    },
    {
        "id": "write_comment",
        "title": "댓글 남기기",
        "description": "댓글 3개 작성",
        "target": 3,
        "points": 15,
        "type": "comment",
    },
    {
        "id": "give_likes",
        "title": "좋아요 누르기",
        "description": "좋아요 5개 누르기",
        "target": 5,
        "points": 10,
        "type": "like",
    },
    {
        "id": "check_in",
        "title": "출석체크",
        "description": "오늘 출석체크하기",
        "target": 1,
        "points": 0,  # 0 because attendance already gives points
        "type": "attendance",
    },
    {
        "id": "visit_board",
        "title": "게시판 탐험",
        "description": "게시글 3개 읽기",
        "target": 3,
        "points": 10,
        "type": "view",
    },
]


def _today_kst() -> date:
    return datetime.now(KST).date()


def _start_of_day_kst(d: date) -> datetime:
    """Return the start of the given KST date as a UTC-aware datetime."""
    return datetime.combine(d, datetime.min.time()).replace(tzinfo=KST)


def _end_of_day_kst(d: date) -> datetime:
    """Return the end of the given KST date as a UTC-aware datetime."""
    return datetime.combine(d, datetime.max.time()).replace(tzinfo=KST)


async def get_quest_progress(db: AsyncSession, user_id) -> dict[str, int]:
    """
    Compute current progress for each quest type for today (KST).
    Returns: {"write_post": 2, "write_comment": 5, ...}
    """
    today = _today_kst()
    start = _start_of_day_kst(today)
    end = _end_of_day_kst(today)

    progress = {}

    # Posts created today
    post_count = (await db.execute(
        select(func.count()).select_from(Post).where(
            Post.user_id == user_id,
            Post.created_at >= start,
            Post.created_at <= end,
        )
    )).scalar() or 0
    progress["write_post"] = post_count

    # Comments created today
    comment_count = (await db.execute(
        select(func.count()).select_from(Comment).where(
            Comment.user_id == user_id,
            Comment.created_at >= start,
            Comment.created_at <= end,
        )
    )).scalar() or 0
    progress["write_comment"] = comment_count

    # Likes given today
    like_count = (await db.execute(
        select(func.count()).select_from(Like).where(
            Like.user_id == user_id,
            Like.created_at >= start,
            Like.created_at <= end,
        )
    )).scalar() or 0
    progress["give_likes"] = like_count

    # Attendance today
    attendance_exists = (await db.execute(
        select(func.count()).select_from(Attendance).where(
            Attendance.user_id == user_id,
            Attendance.checked_at == today,
        )
    )).scalar() or 0
    progress["check_in"] = min(attendance_exists, 1)

    # View count: count PointLog entries with action containing 'view' for today,
    # or fall back to counting post views from PointLog if tracked.
    # Since we may not track individual views, count from PointLog where action
    # starts with view, or use a simplified approach.
    view_count = (await db.execute(
        select(func.count()).select_from(PointLog).where(
            PointLog.user_id == user_id,
            PointLog.action == "view_post",
            PointLog.created_at >= start,
            PointLog.created_at <= end,
        )
    )).scalar() or 0

    # If no view_post logs exist, use post view count approach:
    # Count distinct posts the user has interacted with today
    # (comments, likes on different posts) as a proxy for "reading"
    if view_count == 0:
        # Proxy: count distinct posts the user interacted with today
        # (liked or commented on) as evidence of reading
        distinct_liked_posts = (await db.execute(
            select(func.count(func.distinct(Like.target_id))).where(
                Like.user_id == user_id,
                Like.target_type == "post",
                Like.created_at >= start,
                Like.created_at <= end,
            )
        )).scalar() or 0

        distinct_commented_posts = (await db.execute(
            select(func.count(func.distinct(Comment.post_id))).where(
                Comment.user_id == user_id,
                Comment.created_at >= start,
                Comment.created_at <= end,
            )
        )).scalar() or 0

        # Combine unique post interactions as a proxy for "views"
        view_count = distinct_liked_posts + distinct_commented_posts

    progress["visit_board"] = view_count

    return progress


async def get_claimed_quests(db: AsyncSession, user_id) -> set[str]:
    """Get set of quest IDs already claimed today."""
    today = _today_kst()
    stmt = select(QuestClaim.quest_id).where(
        QuestClaim.user_id == user_id,
        QuestClaim.claimed_date == today,
    )
    rows = (await db.execute(stmt)).all()
    return {row[0] for row in rows}


async def get_daily_quests_with_progress(db: AsyncSession, user_id) -> list[dict]:
    """
    Returns the daily quests with current progress and claim status.
    """
    progress = await get_quest_progress(db, user_id)
    claimed = await get_claimed_quests(db, user_id)

    result = []
    for quest in DAILY_QUESTS:
        current = min(progress.get(quest["id"], 0), quest["target"])
        is_completed = current >= quest["target"]
        is_claimed = quest["id"] in claimed

        result.append({
            "id": quest["id"],
            "title": quest["title"],
            "description": quest["description"],
            "target": quest["target"],
            "current": current,
            "points": quest["points"],
            "completed": is_completed,
            "claimed": is_claimed,
            "claimable": is_completed and not is_claimed and quest["points"] > 0,
        })

    return result
