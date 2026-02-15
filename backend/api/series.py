"""
Post Series (연재) API: CRUD, manage posts in series
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, update
from uuid import UUID

from db.database import get_db
from db.models import User, Post, PostSeries, UserPoints
from api.deps import get_current_user, get_current_user_optional
from core.points import compute_level
from core.sanitizer import sanitize_text

router = APIRouter(prefix="/api/series", tags=["series"])


# ─── Request / Response Models ───────────────────────────────────────────────

class SeriesCreateRequest(BaseModel):
    title: str
    description: str | None = None
    cover_image_url: str | None = None


class SeriesUpdateRequest(BaseModel):
    title: str | None = None
    description: str | None = None
    cover_image_url: str | None = None
    is_complete: bool | None = None


class SeriesAuthor(BaseModel):
    id: str
    nickname: str
    level: int = 1
    level_name: str = "석탄"


class SeriesListItem(BaseModel):
    id: str
    title: str
    description: str | None
    cover_image_url: str | None
    author: SeriesAuthor
    is_complete: bool
    post_count: int
    subscriber_count: int
    created_at: str
    updated_at: str


class SeriesPostItem(BaseModel):
    id: str
    title: str
    series_order: int | None
    like_count: int
    comment_count: int
    view_count: int
    created_at: str


class SeriesDetailResponse(BaseModel):
    id: str
    title: str
    description: str | None
    cover_image_url: str | None
    author: SeriesAuthor
    is_complete: bool
    post_count: int
    subscriber_count: int
    posts: list[SeriesPostItem]
    created_at: str
    updated_at: str


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _series_author(user: User, total_points: int | None) -> SeriesAuthor:
    lv, lv_name = compute_level(total_points or 0)
    return SeriesAuthor(id=str(user.id), nickname=user.nickname, level=lv, level_name=lv_name)


# ─── My Series (must be before /{series_id}) ────────────────────────────────

@router.get("/my", response_model=list[SeriesListItem])
async def get_my_series(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get current user's series."""
    stmt = (
        select(PostSeries, UserPoints.total_points)
        .outerjoin(UserPoints, UserPoints.user_id == PostSeries.user_id)
        .where(PostSeries.user_id == user.id)
        .order_by(PostSeries.created_at.desc())
    )
    result = await db.execute(stmt)
    rows = result.all()

    return [
        SeriesListItem(
            id=str(series.id),
            title=series.title,
            description=series.description,
            cover_image_url=series.cover_image_url,
            author=_series_author(user, pts),
            is_complete=series.is_complete,
            post_count=series.post_count,
            subscriber_count=series.subscriber_count,
            created_at=str(series.created_at),
            updated_at=str(series.updated_at),
        )
        for series, pts in rows
    ]


# ─── CRUD ────────────────────────────────────────────────────────────────────

@router.post("", response_model=SeriesListItem)
async def create_series(
    req: SeriesCreateRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new post series."""
    if not req.title or len(req.title.strip()) == 0:
        raise HTTPException(400, "시리즈 제목을 입력해주세요.")
    if len(req.title) > 200:
        raise HTTPException(400, "시리즈 제목은 200자 이하여야 합니다.")

    series = PostSeries(
        user_id=user.id,
        title=sanitize_text(req.title),
        description=sanitize_text(req.description) if req.description else None,
        cover_image_url=req.cover_image_url[:500] if req.cover_image_url else None,
    )
    db.add(series)
    await db.commit()
    await db.refresh(series)

    up = (await db.execute(
        select(UserPoints.total_points).where(UserPoints.user_id == user.id)
    )).scalar_one_or_none()

    return SeriesListItem(
        id=str(series.id),
        title=series.title,
        description=series.description,
        cover_image_url=series.cover_image_url,
        author=_series_author(user, up),
        is_complete=series.is_complete,
        post_count=series.post_count,
        subscriber_count=series.subscriber_count,
        created_at=str(series.created_at),
        updated_at=str(series.updated_at),
    )


@router.get("", response_model=list[SeriesListItem])
async def list_series(
    sort: str = Query("latest", pattern="^(latest|popular)$"),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
):
    """List all series, paginated."""
    stmt = (
        select(PostSeries, User, UserPoints.total_points)
        .join(User, PostSeries.user_id == User.id)
        .outerjoin(UserPoints, UserPoints.user_id == PostSeries.user_id)
    )

    if sort == "popular":
        stmt = stmt.order_by(PostSeries.subscriber_count.desc(), PostSeries.post_count.desc())
    else:
        stmt = stmt.order_by(PostSeries.created_at.desc())

    stmt = stmt.offset((page - 1) * size).limit(size)
    result = await db.execute(stmt)
    rows = result.all()

    return [
        SeriesListItem(
            id=str(series.id),
            title=series.title,
            description=series.description,
            cover_image_url=series.cover_image_url,
            author=_series_author(author, pts),
            is_complete=series.is_complete,
            post_count=series.post_count,
            subscriber_count=series.subscriber_count,
            created_at=str(series.created_at),
            updated_at=str(series.updated_at),
        )
        for series, author, pts in rows
    ]


@router.get("/{series_id}", response_model=SeriesDetailResponse)
async def get_series_detail(
    series_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get series detail with ordered posts."""
    sid = UUID(series_id)
    stmt = (
        select(PostSeries, User, UserPoints.total_points)
        .join(User, PostSeries.user_id == User.id)
        .outerjoin(UserPoints, UserPoints.user_id == PostSeries.user_id)
        .where(PostSeries.id == sid)
    )
    result = await db.execute(stmt)
    row = result.one_or_none()
    if not row:
        raise HTTPException(404, "시리즈를 찾을 수 없습니다.")

    series, author, pts = row

    # Get posts in this series, ordered by series_order
    posts_stmt = (
        select(Post)
        .where(Post.series_id == sid)
        .order_by(Post.series_order.asc().nullslast(), Post.created_at.asc())
    )
    posts_result = await db.execute(posts_stmt)
    posts = posts_result.scalars().all()

    post_items = [
        SeriesPostItem(
            id=str(p.id),
            title=p.title,
            series_order=p.series_order,
            like_count=p.like_count,
            comment_count=p.comment_count,
            view_count=p.view_count,
            created_at=str(p.created_at),
        )
        for p in posts
    ]

    return SeriesDetailResponse(
        id=str(series.id),
        title=series.title,
        description=series.description,
        cover_image_url=series.cover_image_url,
        author=_series_author(author, pts),
        is_complete=series.is_complete,
        post_count=series.post_count,
        subscriber_count=series.subscriber_count,
        posts=post_items,
        created_at=str(series.created_at),
        updated_at=str(series.updated_at),
    )


@router.put("/{series_id}", response_model=SeriesListItem)
async def update_series(
    series_id: str,
    req: SeriesUpdateRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update a series (owner only)."""
    sid = UUID(series_id)
    stmt = select(PostSeries).where(PostSeries.id == sid, PostSeries.user_id == user.id)
    result = await db.execute(stmt)
    series = result.scalar_one_or_none()
    if not series:
        raise HTTPException(404, "시리즈를 찾을 수 없거나 권한이 없습니다.")

    if req.title is not None:
        if len(req.title.strip()) == 0:
            raise HTTPException(400, "시리즈 제목을 입력해주세요.")
        series.title = sanitize_text(req.title)
    if req.description is not None:
        series.description = sanitize_text(req.description) if req.description else None
    if req.cover_image_url is not None:
        series.cover_image_url = req.cover_image_url[:500] if req.cover_image_url else None
    if req.is_complete is not None:
        series.is_complete = req.is_complete

    await db.commit()
    await db.refresh(series)

    up = (await db.execute(
        select(UserPoints.total_points).where(UserPoints.user_id == user.id)
    )).scalar_one_or_none()

    return SeriesListItem(
        id=str(series.id),
        title=series.title,
        description=series.description,
        cover_image_url=series.cover_image_url,
        author=_series_author(user, up),
        is_complete=series.is_complete,
        post_count=series.post_count,
        subscriber_count=series.subscriber_count,
        created_at=str(series.created_at),
        updated_at=str(series.updated_at),
    )


@router.delete("/{series_id}")
async def delete_series(
    series_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a series (owner only). Does not delete the posts, just unlinks them."""
    sid = UUID(series_id)
    stmt = select(PostSeries).where(PostSeries.id == sid, PostSeries.user_id == user.id)
    result = await db.execute(stmt)
    series = result.scalar_one_or_none()
    if not series:
        raise HTTPException(404, "시리즈를 찾을 수 없거나 권한이 없습니다.")

    # Unlink all posts from this series
    await db.execute(
        update(Post)
        .where(Post.series_id == sid)
        .values(series_id=None, series_order=None)
    )

    await db.delete(series)
    await db.commit()
    return {"message": "시리즈가 삭제되었습니다."}


# ─── Series Post Management ─────────────────────────────────────────────────

@router.post("/{series_id}/posts/{post_id}")
async def add_post_to_series(
    series_id: str,
    post_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Add an existing post to a series. The post must belong to the series owner."""
    sid = UUID(series_id)
    pid = UUID(post_id)

    # Verify series ownership
    series = (await db.execute(
        select(PostSeries).where(PostSeries.id == sid, PostSeries.user_id == user.id)
    )).scalar_one_or_none()
    if not series:
        raise HTTPException(404, "시리즈를 찾을 수 없거나 권한이 없습니다.")

    # Verify post ownership
    post = (await db.execute(
        select(Post).where(Post.id == pid, Post.user_id == user.id)
    )).scalar_one_or_none()
    if not post:
        raise HTTPException(404, "게시글을 찾을 수 없거나 권한이 없습니다.")

    if post.series_id and str(post.series_id) == series_id:
        raise HTTPException(400, "이미 이 시리즈에 포함된 게시글입니다.")

    # Determine next order number
    max_order_result = await db.execute(
        select(func.coalesce(func.max(Post.series_order), 0))
        .where(Post.series_id == sid)
    )
    next_order = (max_order_result.scalar() or 0) + 1

    post.series_id = sid
    post.series_order = next_order

    # Update post count
    series.post_count = (series.post_count or 0) + 1

    await db.commit()
    return {"message": "게시글이 시리즈에 추가되었습니다.", "series_order": next_order}


@router.delete("/{series_id}/posts/{post_id}")
async def remove_post_from_series(
    series_id: str,
    post_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Remove a post from a series (doesn't delete the post)."""
    sid = UUID(series_id)
    pid = UUID(post_id)

    # Verify series ownership
    series = (await db.execute(
        select(PostSeries).where(PostSeries.id == sid, PostSeries.user_id == user.id)
    )).scalar_one_or_none()
    if not series:
        raise HTTPException(404, "시리즈를 찾을 수 없거나 권한이 없습니다.")

    # Verify post belongs to this series
    post = (await db.execute(
        select(Post).where(Post.id == pid, Post.series_id == sid)
    )).scalar_one_or_none()
    if not post:
        raise HTTPException(404, "이 시리즈에 해당 게시글이 없습니다.")

    post.series_id = None
    post.series_order = None

    # Update post count
    if series.post_count and series.post_count > 0:
        series.post_count -= 1

    await db.commit()
    return {"message": "게시글이 시리즈에서 제거되었습니다."}
