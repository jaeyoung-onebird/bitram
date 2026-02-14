"""
Search API: full-text search for posts and users.
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_

from db.database import get_db
from db.models import User, Post

router = APIRouter(prefix="/api/search", tags=["search"])


@router.get("/posts")
async def search_posts(
    q: str = Query(..., min_length=1, max_length=100),
    category: str | None = None,
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
):
    """Search posts by title or content (case-insensitive ILIKE)."""
    pattern = f"%{q}%"
    stmt = (
        select(Post, User.nickname, User.plan)
        .join(User, Post.user_id == User.id)
        .where(or_(Post.title.ilike(pattern), Post.content.ilike(pattern)))
    )
    if category:
        stmt = stmt.where(Post.category == category)

    stmt = (
        stmt.order_by(Post.created_at.desc())
        .offset((page - 1) * size)
        .limit(size)
    )
    rows = (await db.execute(stmt)).all()

    return [
        {
            "id": str(post.id),
            "author": {"id": str(post.user_id), "nickname": nickname, "plan": plan},
            "category": post.category,
            "title": post.title,
            "like_count": post.like_count,
            "comment_count": post.comment_count,
            "view_count": post.view_count,
            "has_strategy": post.strategy_id is not None,
            "verified_profit_pct": (
                post.verified_profit.get("total_return_pct")
                if post.verified_profit else None
            ),
            "is_pinned": post.is_pinned,
            "created_at": str(post.created_at),
        }
        for post, nickname, plan in rows
    ]


@router.get("/users")
async def search_users(
    q: str = Query(..., min_length=1, max_length=50),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
):
    """Search users by nickname."""
    pattern = f"%{q}%"
    stmt = (
        select(
            User.id, User.nickname, User.plan, User.created_at,
            func.count(Post.id).label("post_count"),
        )
        .outerjoin(Post, Post.user_id == User.id)
        .where(User.nickname.ilike(pattern), User.is_active == True)
        .group_by(User.id)
        .order_by(func.count(Post.id).desc())
        .offset((page - 1) * size)
        .limit(size)
    )
    rows = (await db.execute(stmt)).all()

    return [
        {
            "id": str(row.id),
            "nickname": row.nickname,
            "plan": row.plan or "free",
            "post_count": row.post_count,
            "joined_at": str(row.created_at),
        }
        for row in rows
    ]
