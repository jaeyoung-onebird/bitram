"""
Follow Feed API: posts from followed users
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from db.database import get_db
from db.models import User, Post, Follow
from api.deps import get_current_user

router = APIRouter(prefix="/api/feed", tags=["feed"])


@router.get("/following")
async def get_following_feed(
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=50),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Get IDs of users the current user follows
    follow_stmt = select(Follow.following_id).where(Follow.follower_id == user.id)
    follow_result = await db.execute(follow_stmt)
    following_ids = [row[0] for row in follow_result.all()]

    if not following_ids:
        return []

    # Get recent posts from followed users
    stmt = (
        select(Post, User.nickname, User.plan)
        .join(User, Post.user_id == User.id)
        .where(Post.user_id.in_(following_ids))
        .order_by(Post.created_at.desc())
        .offset((page - 1) * size)
        .limit(size)
    )
    result = await db.execute(stmt)
    rows = result.all()

    items = []
    for post, nickname, plan in rows:
        feed_type = "new_post"
        if post.category == "strategy":
            feed_type = "strategy_shared"
        elif post.category == "profit":
            feed_type = "profit_verified"

        items.append({
            "type": feed_type,
            "post_id": str(post.id),
            "title": post.title,
            "category": post.category,
            "author": {
                "id": str(post.user_id),
                "nickname": nickname,
                "plan": plan,
            },
            "like_count": post.like_count,
            "comment_count": post.comment_count,
            "verified_profit_pct": (
                post.verified_profit.get("total_return_pct")
                if post.verified_profit else None
            ),
            "created_at": str(post.created_at),
        })

    return items
