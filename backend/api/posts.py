"""
Community Posts API: CRUD, like, bookmark, copy strategy, profiles, trending
"""
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, update, delete
from uuid import UUID

from db.database import get_db
from db.models import User, Post, Comment, Like, Bookmark, Strategy, Bot
from api.deps import get_current_user

router = APIRouter(prefix="/api/posts", tags=["community"])


class PostCreateRequest(BaseModel):
    category: str  # strategy, profit, question, free
    title: str
    content: str
    strategy_id: str | None = None


class PostUpdateRequest(BaseModel):
    title: str | None = None
    content: str | None = None


class CommentCreateRequest(BaseModel):
    content: str
    parent_id: str | None = None


class AuthorInfo(BaseModel):
    id: str
    nickname: str
    plan: str = "community"


class CommentResponse(BaseModel):
    id: str
    author: AuthorInfo
    content: str
    like_count: int
    parent_id: str | None
    created_at: str


class PostResponse(BaseModel):
    id: str
    author: AuthorInfo
    category: str
    title: str
    content: str
    strategy_id: str | None
    strategy_name: str | None = None
    verified_profit: dict | None
    like_count: int
    comment_count: int
    view_count: int
    is_liked: bool = False
    is_bookmarked: bool = False
    is_pinned: bool
    created_at: str
    updated_at: str


class PostListItem(BaseModel):
    id: str
    author: AuthorInfo
    category: str
    title: str
    like_count: int
    comment_count: int
    view_count: int
    has_strategy: bool
    verified_profit_pct: float | None = None
    is_pinned: bool
    created_at: str


class UserProfileResponse(BaseModel):
    id: str
    nickname: str
    plan: str = "community"
    joined_at: str
    post_count: int
    total_likes_received: int
    total_comments: int
    shared_strategies_count: int
    total_copy_count: int
    recent_posts: list[PostListItem]


class TrendingPostItem(BaseModel):
    id: str
    author: AuthorInfo
    category: str
    title: str
    like_count: int
    comment_count: int
    view_count: int
    has_strategy: bool
    verified_profit_pct: float | None = None
    engagement_score: float
    created_at: str


class StrategyRankingItem(BaseModel):
    post_id: str
    title: str
    author: str
    author_id: str
    verified_profit: dict | None
    like_count: int
    comment_count: int
    copy_count: int
    ranking_score: float
    author_total_bot_profit: float | None = None


# ─── Posts CRUD ──────────────────────────────────────────────────────────────

@router.post("", response_model=PostResponse)
async def create_post(
    req: PostCreateRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if req.category not in ("strategy", "profit", "question", "free"):
        raise HTTPException(400, "유효하지 않은 카테고리입니다.")

    verified_profit = None
    strategy_name = None

    # If profit post, auto-verify from bot data
    if req.category == "profit" and req.strategy_id:
        stmt = select(Strategy).where(Strategy.id == UUID(req.strategy_id), Strategy.user_id == user.id)
        result = await db.execute(stmt)
        strategy = result.scalar_one_or_none()
        if strategy:
            strategy_name = strategy.name
            if strategy.backtest_result:
                verified_profit = {
                    "total_return_pct": strategy.backtest_result.get("total_return_pct"),
                    "win_rate": strategy.backtest_result.get("win_rate"),
                    "max_drawdown_pct": strategy.backtest_result.get("max_drawdown_pct"),
                    "total_trades": strategy.backtest_result.get("total_trades"),
                    "verified": True,
                }

    # For strategy sharing, check real bot profit
    if req.category in ("profit", "strategy") and req.strategy_id:
        stmt = (
            select(func.sum(Bot.total_profit), func.sum(Bot.total_trades), func.sum(Bot.win_trades))
            .where(Bot.strategy_id == UUID(req.strategy_id), Bot.user_id == user.id)
        )
        result = await db.execute(stmt)
        row = result.one_or_none()
        if row and row[1] and row[1] > 0:
            verified_profit = verified_profit or {}
            verified_profit["live_profit_krw"] = float(row[0] or 0)
            verified_profit["live_trades"] = int(row[1] or 0)
            verified_profit["live_win_rate"] = round(int(row[2] or 0) / int(row[1]) * 100, 1)
            verified_profit["verified"] = True

    post = Post(
        user_id=user.id,
        category=req.category,
        title=req.title,
        content=req.content,
        strategy_id=UUID(req.strategy_id) if req.strategy_id else None,
        verified_profit=verified_profit,
    )
    db.add(post)
    await db.commit()
    await db.refresh(post)

    return await _to_post_response(post, user, db, strategy_name=strategy_name)


@router.get("", response_model=list[PostListItem])
async def list_posts(
    category: str | None = None,
    sort: str = Query("latest", regex="^(latest|popular|most_commented)$"),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Post, User.nickname, User.plan).join(User, Post.user_id == User.id)

    if category:
        stmt = stmt.where(Post.category == category)

    if sort == "popular":
        stmt = stmt.order_by(Post.is_pinned.desc(), Post.like_count.desc())
    elif sort == "most_commented":
        stmt = stmt.order_by(Post.is_pinned.desc(), Post.comment_count.desc())
    else:
        stmt = stmt.order_by(Post.is_pinned.desc(), Post.created_at.desc())

    stmt = stmt.offset((page - 1) * size).limit(size)
    result = await db.execute(stmt)
    rows = result.all()

    return [
        PostListItem(
            id=str(post.id),
            author=AuthorInfo(id=str(post.user_id), nickname=nickname, plan=plan),
            category=post.category,
            title=post.title,
            like_count=post.like_count,
            comment_count=post.comment_count,
            view_count=post.view_count,
            has_strategy=post.strategy_id is not None,
            verified_profit_pct=(
                post.verified_profit.get("total_return_pct")
                if post.verified_profit else None
            ),
            is_pinned=post.is_pinned,
            created_at=str(post.created_at),
        )
        for post, nickname, plan in rows
    ]


# ─── Trending Posts ───────────────────────────────────────────────────────────
# NOTE: This route MUST be defined before /{post_id} to avoid FastAPI matching
# "trending" as a post_id UUID.

@router.get("/trending", response_model=list[TrendingPostItem])
async def trending_posts(
    db: AsyncSession = Depends(get_db),
):
    """Returns trending posts: high engagement in the last 7 days."""
    seven_days_ago = datetime.now(timezone.utc) - timedelta(days=7)

    # Engagement score: like_count * 2 + comment_count * 3 + view_count
    engagement_score = (
        Post.like_count * 2 + Post.comment_count * 3 + Post.view_count
    ).label("engagement_score")

    stmt = (
        select(Post, User.nickname, User.plan, engagement_score)
        .join(User, Post.user_id == User.id)
        .where(Post.created_at >= seven_days_ago)
        .order_by(engagement_score.desc())
        .limit(10)
    )
    result = await db.execute(stmt)
    rows = result.all()

    return [
        TrendingPostItem(
            id=str(post.id),
            author=AuthorInfo(id=str(post.user_id), nickname=nickname, plan=plan),
            category=post.category,
            title=post.title,
            like_count=post.like_count,
            comment_count=post.comment_count,
            view_count=post.view_count,
            has_strategy=post.strategy_id is not None,
            verified_profit_pct=(
                post.verified_profit.get("total_return_pct")
                if post.verified_profit else None
            ),
            engagement_score=float(score),
            created_at=str(post.created_at),
        )
        for post, nickname, plan, score in rows
    ]


# ─── User Profile ────────────────────────────────────────────────────────────
# NOTE: This route MUST be defined before /{post_id} to avoid FastAPI matching
# "user" as a post_id UUID.

@router.get("/user/{user_id}/profile", response_model=UserProfileResponse)
async def get_user_profile(
    user_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Returns a user's public profile with community stats."""
    uid = UUID(user_id)

    # Fetch user
    target_user = await db.get(User, uid)
    if not target_user:
        raise HTTPException(404, "사용자를 찾을 수 없습니다.")

    # Post count
    stmt = select(func.count()).select_from(Post).where(Post.user_id == uid)
    post_count = (await db.execute(stmt)).scalar() or 0

    # Total likes received (sum of like_count on all user's posts)
    stmt = select(func.coalesce(func.sum(Post.like_count), 0)).where(Post.user_id == uid)
    total_likes = (await db.execute(stmt)).scalar() or 0

    # Total comments on user's posts
    stmt = select(func.coalesce(func.sum(Post.comment_count), 0)).where(Post.user_id == uid)
    total_comments = (await db.execute(stmt)).scalar() or 0

    # Shared strategies count (public strategies)
    stmt = (
        select(func.count())
        .select_from(Strategy)
        .where(Strategy.user_id == uid, Strategy.is_public == True)
    )
    shared_strategies_count = (await db.execute(stmt)).scalar() or 0

    # Total copy count of their strategies
    stmt = (
        select(func.coalesce(func.sum(Strategy.copy_count), 0))
        .where(Strategy.user_id == uid)
    )
    total_copy_count = (await db.execute(stmt)).scalar() or 0

    # Recent posts (last 5)
    stmt = (
        select(Post, User.nickname, User.plan)
        .join(User, Post.user_id == User.id)
        .where(Post.user_id == uid)
        .order_by(Post.created_at.desc())
        .limit(5)
    )
    result = await db.execute(stmt)
    recent_rows = result.all()

    recent_posts = [
        PostListItem(
            id=str(post.id),
            author=AuthorInfo(id=str(post.user_id), nickname=nickname, plan=plan),
            category=post.category,
            title=post.title,
            like_count=post.like_count,
            comment_count=post.comment_count,
            view_count=post.view_count,
            has_strategy=post.strategy_id is not None,
            verified_profit_pct=(
                post.verified_profit.get("total_return_pct")
                if post.verified_profit else None
            ),
            is_pinned=post.is_pinned,
            created_at=str(post.created_at),
        )
        for post, nickname, plan in recent_rows
    ]

    return UserProfileResponse(
        id=str(target_user.id),
        nickname=target_user.nickname,
        plan=target_user.plan or "community",
        joined_at=str(target_user.created_at),
        post_count=post_count,
        total_likes_received=total_likes,
        total_comments=total_comments,
        shared_strategies_count=shared_strategies_count,
        total_copy_count=total_copy_count,
        recent_posts=recent_posts,
    )


# ─── Ranking (improved) ──────────────────────────────────────────────────────
# NOTE: This route MUST be defined before /{post_id} to avoid FastAPI matching
# "ranking" as a post_id UUID.

@router.get("/ranking/strategies", response_model=list[StrategyRankingItem])
async def strategy_ranking(
    period: str = Query("all", pattern="^(week|month|all)$"),
    db: AsyncSession = Depends(get_db),
):
    """
    Strategy ranking sorted by weighted score:
      verified_profit_pct * 0.4 + like_count * 0.3 + copy_count * 0.3
    Includes period filter (week/month/all) and author's total bot profit.
    """
    # Build the base query joining Post -> User and optionally Strategy
    stmt = (
        select(
            Post,
            User.nickname,
            User.id.label("author_id"),
            Strategy.copy_count,
        )
        .join(User, Post.user_id == User.id)
        .outerjoin(Strategy, Post.strategy_id == Strategy.id)
        .where(
            Post.category.in_(["strategy", "profit"]),
            Post.verified_profit.isnot(None),
        )
    )

    # Period filter
    now = datetime.now(timezone.utc)
    if period == "week":
        stmt = stmt.where(Post.created_at >= now - timedelta(days=7))
    elif period == "month":
        stmt = stmt.where(Post.created_at >= now - timedelta(days=30))

    stmt = stmt.limit(20)
    result = await db.execute(stmt)
    rows = result.all()

    # Compute ranking scores and fetch author bot profit
    ranked = []
    for post, nickname, author_id, copy_count in rows:
        # Extract verified profit percentage
        verified_profit_pct = 0.0
        if post.verified_profit:
            verified_profit_pct = float(post.verified_profit.get("total_return_pct") or 0)

        copy_cnt = int(copy_count or 0)

        # Weighted ranking score
        ranking_score = (
            verified_profit_pct * 0.4
            + post.like_count * 0.3
            + copy_cnt * 0.3
        )

        # Author's total bot profit
        profit_stmt = (
            select(func.coalesce(func.sum(Bot.total_profit), 0))
            .where(Bot.user_id == author_id)
        )
        profit_result = await db.execute(profit_stmt)
        author_bot_profit = float(profit_result.scalar() or 0)

        ranked.append(StrategyRankingItem(
            post_id=str(post.id),
            title=post.title,
            author=nickname,
            author_id=str(author_id),
            verified_profit=post.verified_profit,
            like_count=post.like_count,
            comment_count=post.comment_count,
            copy_count=copy_cnt,
            ranking_score=round(ranking_score, 2),
            author_total_bot_profit=author_bot_profit if author_bot_profit else None,
        ))

    # Sort by ranking_score descending
    ranked.sort(key=lambda x: x.ranking_score, reverse=True)
    return ranked


@router.get("/{post_id}", response_model=PostResponse)
async def get_post(
    post_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Post).where(Post.id == UUID(post_id))
    result = await db.execute(stmt)
    post = result.scalar_one_or_none()
    if not post:
        raise HTTPException(404, "게시글을 찾을 수 없습니다.")

    # Increment view count
    post.view_count = (post.view_count or 0) + 1
    await db.commit()

    # Get author
    author = await db.get(User, post.user_id)
    return await _to_post_response(post, author, db, current_user_id=user.id)


@router.put("/{post_id}", response_model=PostResponse)
async def update_post(
    post_id: str,
    req: PostUpdateRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Post).where(Post.id == UUID(post_id), Post.user_id == user.id)
    result = await db.execute(stmt)
    post = result.scalar_one_or_none()
    if not post:
        raise HTTPException(404, "게시글을 찾을 수 없습니다.")

    if req.title is not None:
        post.title = req.title
    if req.content is not None:
        post.content = req.content

    await db.commit()
    await db.refresh(post)
    return await _to_post_response(post, user, db)


@router.delete("/{post_id}")
async def delete_post(
    post_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Post).where(Post.id == UUID(post_id), Post.user_id == user.id)
    result = await db.execute(stmt)
    post = result.scalar_one_or_none()
    if not post:
        raise HTTPException(404, "게시글을 찾을 수 없습니다.")

    await db.delete(post)
    await db.commit()
    return {"message": "삭제되었습니다."}


# ─── Like / Bookmark ─────────────────────────────────────────────────────────

@router.post("/{post_id}/like")
async def toggle_like(
    post_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    pid = UUID(post_id)
    stmt = select(Like).where(Like.user_id == user.id, Like.target_type == "post", Like.target_id == pid)
    result = await db.execute(stmt)
    existing = result.scalar_one_or_none()

    if existing:
        await db.delete(existing)
        await db.execute(update(Post).where(Post.id == pid).values(like_count=Post.like_count - 1))
        await db.commit()
        return {"liked": False}
    else:
        db.add(Like(user_id=user.id, target_type="post", target_id=pid))
        await db.execute(update(Post).where(Post.id == pid).values(like_count=Post.like_count + 1))
        await db.commit()
        return {"liked": True}


@router.post("/{post_id}/bookmark")
async def toggle_bookmark(
    post_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    pid = UUID(post_id)
    stmt = select(Bookmark).where(Bookmark.user_id == user.id, Bookmark.post_id == pid)
    result = await db.execute(stmt)
    existing = result.scalar_one_or_none()

    if existing:
        await db.delete(existing)
        await db.commit()
        return {"bookmarked": False}
    else:
        db.add(Bookmark(user_id=user.id, post_id=pid))
        await db.commit()
        return {"bookmarked": True}


# ─── Comments ────────────────────────────────────────────────────────────────

@router.get("/{post_id}/comments", response_model=list[CommentResponse])
async def list_comments(
    post_id: str,
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(Comment, User.nickname, User.plan)
        .join(User, Comment.user_id == User.id)
        .where(Comment.post_id == UUID(post_id))
        .order_by(Comment.created_at.asc())
    )
    result = await db.execute(stmt)
    rows = result.all()
    return [
        CommentResponse(
            id=str(c.id),
            author=AuthorInfo(id=str(c.user_id), nickname=nick, plan=plan),
            content=c.content,
            like_count=c.like_count,
            parent_id=str(c.parent_id) if c.parent_id else None,
            created_at=str(c.created_at),
        )
        for c, nick, plan in rows
    ]


@router.post("/{post_id}/comments", response_model=CommentResponse)
async def create_comment(
    post_id: str,
    req: CommentCreateRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    pid = UUID(post_id)
    # Verify post exists
    post = await db.get(Post, pid)
    if not post:
        raise HTTPException(404, "게시글을 찾을 수 없습니다.")

    comment = Comment(
        post_id=pid,
        user_id=user.id,
        content=req.content,
        parent_id=UUID(req.parent_id) if req.parent_id else None,
    )
    db.add(comment)

    # Update comment count
    post.comment_count = (post.comment_count or 0) + 1
    await db.commit()
    await db.refresh(comment)

    return CommentResponse(
        id=str(comment.id),
        author=AuthorInfo(id=str(user.id), nickname=user.nickname, plan=user.plan),
        content=comment.content,
        like_count=0,
        parent_id=str(comment.parent_id) if comment.parent_id else None,
        created_at=str(comment.created_at),
    )


# ─── Strategy Copy from Post ────────────────────────────────────────────────

@router.post("/{post_id}/copy-strategy")
async def copy_strategy_from_post(
    post_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    post = await db.get(Post, UUID(post_id))
    if not post or not post.strategy_id:
        raise HTTPException(400, "이 게시글에는 전략이 첨부되어 있지 않습니다.")

    strategy = await db.get(Strategy, post.strategy_id)
    if not strategy or not strategy.is_public:
        raise HTTPException(403, "비공개 전략은 복사할 수 없습니다.")

    new_strategy = Strategy(
        user_id=user.id,
        name=f"{strategy.name} (복사본)",
        description=strategy.description,
        pair=strategy.pair,
        timeframe=strategy.timeframe,
        config_json=strategy.config_json,
    )
    db.add(new_strategy)
    strategy.copy_count = (strategy.copy_count or 0) + 1
    await db.commit()
    await db.refresh(new_strategy)

    return {"strategy_id": str(new_strategy.id), "message": "전략이 복사되었습니다."}


# ─── Helpers ─────────────────────────────────────────────────────────────────

async def _to_post_response(post: Post, author: User, db: AsyncSession,
                            current_user_id=None, strategy_name=None) -> PostResponse:
    is_liked = False
    is_bookmarked = False

    if current_user_id:
        stmt = select(Like).where(
            Like.user_id == current_user_id, Like.target_type == "post", Like.target_id == post.id
        )
        is_liked = (await db.execute(stmt)).scalar_one_or_none() is not None

        stmt = select(Bookmark).where(Bookmark.user_id == current_user_id, Bookmark.post_id == post.id)
        is_bookmarked = (await db.execute(stmt)).scalar_one_or_none() is not None

    if not strategy_name and post.strategy_id:
        strategy = await db.get(Strategy, post.strategy_id)
        strategy_name = strategy.name if strategy else None

    return PostResponse(
        id=str(post.id),
        author=AuthorInfo(id=str(author.id), nickname=author.nickname, plan=author.plan),
        category=post.category,
        title=post.title,
        content=post.content,
        strategy_id=str(post.strategy_id) if post.strategy_id else None,
        strategy_name=strategy_name,
        verified_profit=post.verified_profit,
        like_count=post.like_count,
        comment_count=post.comment_count,
        view_count=post.view_count,
        is_liked=is_liked,
        is_bookmarked=is_bookmarked,
        is_pinned=post.is_pinned,
        created_at=str(post.created_at),
        updated_at=str(post.updated_at),
    )
