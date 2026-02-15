"""
Community Posts API: CRUD, like, bookmark, copy strategy, profiles, trending
"""
import json as _json
import math
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, update, delete
from uuid import UUID

from db.database import get_db
from db.models import (
    User, Post, Comment, Like, Bookmark, Strategy, Bot, Badge, UserPoints,
    Reaction, Follow, SubCommunityMember,
)
from api.deps import get_current_user, get_current_user_optional
from api.notifications import create_notification
from core.points import compute_level
from core.sanitizer import sanitize_text, sanitize_content, sanitize_markdown
from core.redis_cache import cache_get, cache_set, cache_delete
from middleware.rate_limit import rate_limit

router = APIRouter(prefix="/api/posts", tags=["community"])


class PostCreateRequest(BaseModel):
    category: str  # strategy, profit, question, free, chart, news, humor
    title: str
    content: str
    content_format: str = "plain"  # plain, markdown
    strategy_id: str | None = None
    sub_community_id: str | None = None


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
    level: int = 1
    level_name: str = "씨앗"


class CommentResponse(BaseModel):
    id: str
    author: AuthorInfo
    content: str
    like_count: int
    is_liked: bool = False
    parent_id: str | None
    created_at: str


class PostResponse(BaseModel):
    id: str
    author: AuthorInfo
    category: str
    title: str
    content: str
    content_format: str = "plain"
    strategy_id: str | None
    strategy_name: str | None = None
    verified_profit: dict | None
    like_count: int
    comment_count: int
    view_count: int
    is_liked: bool = False
    is_bookmarked: bool = False
    is_pinned: bool = False
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
    is_pinned: bool = False
    created_at: str


class BadgeInfo(BaseModel):
    type: str
    label: str

class UserProfileResponse(BaseModel):
    id: str
    nickname: str
    plan: str = "community"
    joined_at: str
    level: int = 1
    level_name: str = "씨앗"
    total_points: int = 0
    next_level_name: str | None = None
    next_threshold: int | None = None
    post_count: int
    total_likes_received: int
    total_comments: int
    shared_strategies_count: int
    total_copy_count: int
    badges: list[BadgeInfo] = []
    follower_count: int = 0
    following_count: int = 0
    is_following: bool = False
    recent_posts: list[PostListItem]


class HotPostItem(BaseModel):
    id: str
    author: AuthorInfo
    category: str
    title: str
    like_count: int
    comment_count: int
    view_count: int
    has_strategy: bool
    verified_profit_pct: float | None = None
    velocity_score: float
    created_at: str


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
    if req.category not in ("strategy", "profit", "question", "free", "chart", "news", "humor"):
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

    # Validate content_format
    c_format = req.content_format if req.content_format in ("plain", "markdown") else "plain"
    sanitized_content = sanitize_markdown(req.content) if c_format == "markdown" else sanitize_content(req.content)

    post = Post(
        user_id=user.id,
        category=req.category,
        title=sanitize_text(req.title),
        content=sanitized_content,
        content_format=c_format,
        strategy_id=UUID(req.strategy_id) if req.strategy_id else None,
        sub_community_id=UUID(req.sub_community_id) if req.sub_community_id else None,
        verified_profit=verified_profit,
    )
    db.add(post)

    # Award points for posting
    try:
        from core.points import award_points
        await award_points(db, user.id, "first_post", "첫 게시글 작성 보너스")
        await award_points(db, user.id, "post", f"게시글 작성: {req.title[:30]}")
        if req.category in ("strategy", "profit") and req.strategy_id:
            await award_points(db, user.id, "strategy_shared", f"전략 공유: {req.title[:30]}")
    except Exception:
        pass

    # Check referral milestones (e.g., first post by referred user rewards referrer)
    try:
        from core.referral_rewards import check_referral_milestones
        await check_referral_milestones(db, user.id)
    except Exception:
        pass

    await db.commit()
    await db.refresh(post)

    # Invalidate trending & hot cache
    await cache_delete("posts:trending")
    await cache_delete("posts:hot")

    return await _to_post_response(post, user, db, strategy_name=strategy_name)


@router.get("", response_model=list[PostListItem])
async def list_posts(
    category: str | None = None,
    sort: str = Query("latest", regex="^(latest|popular|most_commented)$"),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(Post, User.nickname, User.plan, UserPoints.total_points)
        .join(User, Post.user_id == User.id)
        .outerjoin(UserPoints, UserPoints.user_id == Post.user_id)
    )

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
            author=_author(post.user_id, nickname, plan, pts),
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
        for post, nickname, plan, pts in rows
    ]


# ─── Trending Posts ───────────────────────────────────────────────────────────
# NOTE: This route MUST be defined before /{post_id} to avoid FastAPI matching
# "trending" as a post_id UUID.

@router.get("/trending", response_model=list[TrendingPostItem])
async def trending_posts(
    db: AsyncSession = Depends(get_db),
):
    """Returns trending posts: high engagement in the last 7 days. Cached for 5 minutes."""
    # Check cache first
    cached = await cache_get("posts:trending")
    if cached:
        return _json.loads(cached)

    seven_days_ago = datetime.now(timezone.utc) - timedelta(days=7)

    # Engagement score: like_count * 2 + comment_count * 3 + view_count
    engagement_score = (
        Post.like_count * 2 + Post.comment_count * 3 + Post.view_count
    ).label("engagement_score")

    stmt = (
        select(Post, User.nickname, User.plan, engagement_score, UserPoints.total_points)
        .join(User, Post.user_id == User.id)
        .outerjoin(UserPoints, UserPoints.user_id == Post.user_id)
        .where(Post.created_at >= seven_days_ago)
        .order_by(engagement_score.desc())
        .limit(10)
    )
    result = await db.execute(stmt)
    rows = result.all()

    items = [
        TrendingPostItem(
            id=str(post.id),
            author=_author(post.user_id, nickname, plan, pts),
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
        for post, nickname, plan, score, pts in rows
    ]

    # Cache for 5 minutes
    await cache_set("posts:trending", _json.dumps([i.model_dump() for i in items]), ttl=300)

    return items


# ─── Hot Posts (velocity-based) ──────────────────────────────────────────────
# NOTE: This route MUST be defined before /{post_id} to avoid FastAPI matching
# "hot" as a post_id UUID.

@router.get("/hot", response_model=list[HotPostItem])
async def get_hot_posts(
    db: AsyncSession = Depends(get_db),
):
    """
    Hot posts = high engagement velocity (likes+comments per hour since creation).
    Score = (like_count * 2 + comment_count * 3 + view_count * 0.1) / max(hours_since_creation, 1)
    Apply log dampening for very old posts. Returns top 20 from last 48 hours.
    Cached for 5 minutes.
    """
    # Check cache first
    cached = await cache_get("posts:hot")
    if cached:
        return _json.loads(cached)

    forty_eight_hours_ago = datetime.now(timezone.utc) - timedelta(hours=48)

    stmt = (
        select(Post, User.nickname, User.plan, UserPoints.total_points)
        .join(User, Post.user_id == User.id)
        .outerjoin(UserPoints, UserPoints.user_id == Post.user_id)
        .where(Post.created_at >= forty_eight_hours_ago)
        .order_by(Post.created_at.desc())
        .limit(200)
    )
    result = await db.execute(stmt)
    rows = result.all()

    now = datetime.now(timezone.utc)
    scored_items = []
    for post, nickname, plan, pts in rows:
        hours_since = max((now - post.created_at).total_seconds() / 3600, 1)
        raw_engagement = (
            (post.like_count or 0) * 2
            + (post.comment_count or 0) * 3
            + (post.view_count or 0) * 0.1
        )
        # Velocity = engagement per hour
        velocity = raw_engagement / hours_since
        # Log dampening for posts older than 12 hours
        if hours_since > 12:
            dampening = math.log2(12) / math.log2(hours_since)
            velocity *= dampening

        scored_items.append((velocity, post, nickname, plan, pts))

    # Sort by velocity score descending
    scored_items.sort(key=lambda x: x[0], reverse=True)
    top_items = scored_items[:20]

    items = [
        HotPostItem(
            id=str(post.id),
            author=_author(post.user_id, nickname, plan, pts),
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
            velocity_score=round(velocity_score, 4),
            created_at=str(post.created_at),
        )
        for velocity_score, post, nickname, plan, pts in top_items
    ]

    # Cache for 5 minutes
    await cache_set("posts:hot", _json.dumps([i.model_dump() for i in items]), ttl=300)

    return items


# ─── User Profile ────────────────────────────────────────────────────────────
# NOTE: This route MUST be defined before /{post_id} to avoid FastAPI matching
# "user" as a post_id UUID.

@router.get("/user/{user_id}/profile", response_model=UserProfileResponse)
async def get_user_profile(
    user_id: str,
    current_user: User | None = Depends(get_current_user_optional),
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

    # Badges
    from db.models import Follow
    badge_stmt = select(Badge).where(Badge.user_id == uid)
    badge_rows = (await db.execute(badge_stmt)).scalars().all()
    badges = [BadgeInfo(type=b.type, label=b.label) for b in badge_rows]

    # Follower/following counts
    follower_count = (await db.execute(
        select(func.count()).select_from(Follow).where(Follow.following_id == uid)
    )).scalar() or 0
    following_count = (await db.execute(
        select(func.count()).select_from(Follow).where(Follow.follower_id == uid)
    )).scalar() or 0

    # Is current user following this user?
    is_following = False
    if current_user:
        f_exists = (await db.execute(
            select(Follow).where(Follow.follower_id == current_user.id, Follow.following_id == uid)
        )).scalar_one_or_none()
        is_following = f_exists is not None

    # Level & Points
    up = (await db.execute(
        select(UserPoints).where(UserPoints.user_id == uid)
    )).scalar_one_or_none()
    tp = up.total_points if up else 0
    lv, lv_name = compute_level(tp)
    from core.points import next_level_info
    nli = next_level_info(tp)

    return UserProfileResponse(
        id=str(target_user.id),
        nickname=target_user.nickname,
        plan=target_user.plan or "community",
        joined_at=str(target_user.created_at),
        level=lv,
        level_name=lv_name,
        total_points=tp,
        next_level_name=nli.get("next_level_name"),
        next_threshold=nli.get("next_threshold"),
        post_count=post_count,
        total_likes_received=total_likes,
        total_comments=total_comments,
        shared_strategies_count=shared_strategies_count,
        total_copy_count=total_copy_count,
        badges=badges,
        follower_count=follower_count,
        following_count=following_count,
        is_following=is_following,
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

    # Batch-fetch author bot profits in one query (fix N+1)
    author_ids = list({row.author_id for _, _, author_id, _ in rows})
    author_profits: dict[str, float] = {}
    if author_ids:
        profit_stmt = (
            select(Bot.user_id, func.coalesce(func.sum(Bot.total_profit), 0))
            .where(Bot.user_id.in_(author_ids))
            .group_by(Bot.user_id)
        )
        profit_rows = (await db.execute(profit_stmt)).all()
        author_profits = {str(uid): float(p) for uid, p in profit_rows}

    ranked = []
    for post, nickname, author_id, copy_count in rows:
        verified_profit_pct = 0.0
        if post.verified_profit:
            verified_profit_pct = float(post.verified_profit.get("total_return_pct") or 0)

        copy_cnt = int(copy_count or 0)
        ranking_score = (
            verified_profit_pct * 0.4
            + post.like_count * 0.3
            + copy_cnt * 0.3
        )
        author_bot_profit = author_profits.get(str(author_id), 0.0)

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

    ranked.sort(key=lambda x: x.ranking_score, reverse=True)
    return ranked


# ─── Sitemap ────────────────────────────────────────────────────────────────
# NOTE: Must be defined before /{post_id}

@router.get("/sitemap")
async def posts_sitemap(
    db: AsyncSession = Depends(get_db),
):
    """Public endpoint for sitemap: returns recent 1000 posts (id + updated_at)."""
    stmt = (
        select(Post.id, Post.updated_at)
        .order_by(Post.updated_at.desc())
        .limit(1000)
    )
    rows = (await db.execute(stmt)).all()
    return [
        {"id": str(pid), "updated_at": str(updated)}
        for pid, updated in rows
    ]


@router.get("/sitemap/urls")
async def sitemap_urls(
    db: AsyncSession = Depends(get_db),
):
    """
    Extended sitemap: returns post URLs + user profile URLs + series URLs.
    Used by the frontend sitemap generator.
    """
    from db.models import PostSeries

    # Post URLs (recent 1000)
    post_stmt = (
        select(Post.id, Post.updated_at)
        .order_by(Post.updated_at.desc())
        .limit(1000)
    )
    post_rows = (await db.execute(post_stmt)).all()
    post_urls = [
        {"loc": f"/community/{str(pid)}", "lastmod": str(updated), "type": "post"}
        for pid, updated in post_rows
    ]

    # User profile URLs (active users with at least 1 post)
    user_stmt = (
        select(User.nickname, User.updated_at)
        .where(User.is_active == True)
        .where(
            User.id.in_(
                select(Post.user_id).distinct()
            )
        )
        .order_by(User.updated_at.desc())
        .limit(500)
    )
    user_rows = (await db.execute(user_stmt)).all()
    user_urls = [
        {"loc": f"/user/{nickname}", "lastmod": str(updated), "type": "profile"}
        for nickname, updated in user_rows
    ]

    # Series URLs
    series_stmt = (
        select(PostSeries.id, PostSeries.updated_at)
        .order_by(PostSeries.updated_at.desc())
        .limit(500)
    )
    series_rows = (await db.execute(series_stmt)).all()
    series_urls = [
        {"loc": f"/series/{str(sid)}", "lastmod": str(updated), "type": "series"}
        for sid, updated in series_rows
    ]

    return {
        "urls": post_urls + user_urls + series_urls,
        "total": len(post_urls) + len(user_urls) + len(series_urls),
    }


# ─── Personalized Feed ──────────────────────────────────────────────────────
# NOTE: Must be defined before /{post_id}

@router.get("/personalized", response_model=list[PostListItem])
async def personalized_feed(
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=50),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Personalized feed:
      - Following users' posts: weight x3
      - Joined sub-community posts: weight x2
      - Popular last 7 days: weight x1.5
      - Time decay: 0.9 per 24h
    """
    import math

    now = datetime.now(timezone.utc)
    seven_days_ago = now - timedelta(days=7)

    # Get followed user IDs
    follow_stmt = select(Follow.following_id).where(Follow.follower_id == user.id)
    followed_ids = {r[0] for r in (await db.execute(follow_stmt)).all()}

    # Get joined sub-community IDs
    sub_stmt = select(SubCommunityMember.sub_community_id).where(SubCommunityMember.user_id == user.id)
    joined_sub_ids = {r[0] for r in (await db.execute(sub_stmt)).all()}

    # Fetch recent posts (wider pool)
    stmt = (
        select(Post, User.nickname, User.plan, UserPoints.total_points)
        .join(User, Post.user_id == User.id)
        .outerjoin(UserPoints, UserPoints.user_id == Post.user_id)
        .where(Post.created_at >= seven_days_ago)
        .order_by(Post.created_at.desc())
        .limit(200)
    )
    rows = (await db.execute(stmt)).all()

    scored_items = []
    for post, nickname, plan, pts in rows:
        score = 1.0

        # Following bonus
        if post.user_id in followed_ids:
            score *= 3.0

        # Sub-community bonus
        if post.sub_community_id and post.sub_community_id in joined_sub_ids:
            score *= 2.0

        # Engagement bonus
        engagement = post.like_count * 2 + post.comment_count * 3 + post.view_count
        if engagement > 50:
            score *= 1.5

        # Time decay (0.9 per 24h)
        hours_old = (now - post.created_at).total_seconds() / 3600
        score *= math.pow(0.9, hours_old / 24)

        scored_items.append((score, post, nickname, plan, pts))

    # Sort by score descending
    scored_items.sort(key=lambda x: x[0], reverse=True)

    # Paginate
    start = (page - 1) * size
    page_items = scored_items[start:start + size]

    return [
        PostListItem(
            id=str(post.id),
            author=_author(post.user_id, nickname, plan, pts),
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
        for _, post, nickname, plan, pts in page_items
    ]


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
        post.title = sanitize_text(req.title)
    if req.content is not None:
        # Use markdown sanitizer if the post was created with markdown format
        if getattr(post, 'content_format', 'plain') == "markdown":
            post.content = sanitize_markdown(req.content)
        else:
            post.content = sanitize_content(req.content)

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
        # Notify post author
        post = await db.get(Post, pid)
        if post:
            await create_notification(
                db, user_id=post.user_id, actor_id=user.id,
                type="like", target_type="post", target_id=pid,
                message=f"{user.nickname}님이 회원님의 글을 좋아합니다",
            )
            # Award points to post author for receiving a like
            try:
                from core.points import award_points
                await award_points(db, post.user_id, "like_received", f"좋아요 받음: {post.title[:30]}")
            except Exception:
                pass
        await db.commit()
        return {"liked": True}


@router.post("/{post_id}/comments/{comment_id}/like")
async def toggle_comment_like(
    post_id: str,
    comment_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    cid = UUID(comment_id)
    comment = await db.get(Comment, cid)
    if not comment or str(comment.post_id) != post_id:
        raise HTTPException(404, "댓글을 찾을 수 없습니다.")

    stmt = select(Like).where(Like.user_id == user.id, Like.target_type == "comment", Like.target_id == cid)
    existing = (await db.execute(stmt)).scalar_one_or_none()

    if existing:
        await db.delete(existing)
        await db.execute(update(Comment).where(Comment.id == cid).values(like_count=Comment.like_count - 1))
        await db.commit()
        return {"liked": False}
    else:
        db.add(Like(user_id=user.id, target_type="comment", target_id=cid))
        await db.execute(update(Comment).where(Comment.id == cid).values(like_count=Comment.like_count + 1))
        if comment.user_id != user.id:
            await create_notification(
                db, user_id=comment.user_id, actor_id=user.id,
                type="like", target_type="post", target_id=comment.post_id,
                message=f"{user.nickname}님이 회원님의 댓글을 좋아합니다",
            )
            try:
                from core.points import award_points
                await award_points(db, comment.user_id, "like_received", "댓글 좋아요 받음")
            except Exception:
                pass
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
    current_user: User | None = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(Comment, User.nickname, User.plan, UserPoints.total_points)
        .join(User, Comment.user_id == User.id)
        .outerjoin(UserPoints, UserPoints.user_id == Comment.user_id)
        .where(Comment.post_id == UUID(post_id))
        .order_by(Comment.created_at.asc())
    )
    result = await db.execute(stmt)
    rows = result.all()

    # Batch check liked comment IDs for current user
    liked_ids: set = set()
    if current_user:
        comment_ids = [c.id for c, *_ in rows]
        if comment_ids:
            liked_stmt = select(Like.target_id).where(
                Like.user_id == current_user.id,
                Like.target_type == "comment",
                Like.target_id.in_(comment_ids),
            )
            liked_ids = {r[0] for r in (await db.execute(liked_stmt)).all()}

    return [
        CommentResponse(
            id=str(c.id),
            author=_author(c.user_id, nick, plan, pts),
            content=c.content,
            like_count=c.like_count,
            is_liked=c.id in liked_ids,
            parent_id=str(c.parent_id) if c.parent_id else None,
            created_at=str(c.created_at),
        )
        for c, nick, plan, pts in rows
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
        content=sanitize_text(req.content),
        parent_id=UUID(req.parent_id) if req.parent_id else None,
    )
    db.add(comment)

    # Update comment count
    post.comment_count = (post.comment_count or 0) + 1

    # Notify post author about comment
    await create_notification(
        db, user_id=post.user_id, actor_id=user.id,
        type="comment", target_type="post", target_id=pid,
        message=f"{user.nickname}님이 회원님의 글에 댓글을 남겼습니다",
    )

    # If it's a reply, also notify the parent comment author
    if req.parent_id:
        parent_comment = await db.get(Comment, UUID(req.parent_id))
        if parent_comment:
            await create_notification(
                db, user_id=parent_comment.user_id, actor_id=user.id,
                type="reply", target_type="post", target_id=pid,
                message=f"{user.nickname}님이 회원님의 댓글에 답글을 남겼습니다",
            )

    # Award points for commenting
    try:
        from core.points import award_points
        await award_points(db, user.id, "comment", f"댓글 작성")
    except Exception:
        pass

    # Parse @mentions in comment content
    import re
    mentions = re.findall(r"@(\S+)", req.content)
    if mentions:
        for mention_nick in mentions[:5]:  # max 5 mentions per comment
            m_stmt = select(User).where(User.nickname == mention_nick)
            m_result = await db.execute(m_stmt)
            mentioned_user = m_result.scalar_one_or_none()
            if mentioned_user:
                await create_notification(
                    db, user_id=mentioned_user.id, actor_id=user.id,
                    type="mention", target_type="post", target_id=pid,
                    message=f"{user.nickname}님이 댓글에서 회원님을 언급했습니다",
                )

    await db.commit()
    await db.refresh(comment)

    c_up = (await db.execute(select(UserPoints.total_points).where(UserPoints.user_id == user.id))).scalar_one_or_none()
    return CommentResponse(
        id=str(comment.id),
        author=_author(user.id, user.nickname, user.plan, c_up),
        content=comment.content,
        like_count=0,
        parent_id=str(comment.parent_id) if comment.parent_id else None,
        created_at=str(comment.created_at),
    )


# ─── Comment Edit / Delete ─────────────────────────────────────────────────

class CommentUpdateRequest(BaseModel):
    content: str


@router.put("/{post_id}/comments/{comment_id}", response_model=CommentResponse)
async def update_comment(
    post_id: str,
    comment_id: str,
    req: CommentUpdateRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    comment = await db.get(Comment, UUID(comment_id))
    if not comment or str(comment.user_id) != str(user.id):
        raise HTTPException(404, "댓글을 찾을 수 없습니다.")
    if comment.is_deleted:
        raise HTTPException(400, "삭제된 댓글은 수정할 수 없습니다.")

    comment.content = sanitize_text(req.content)
    await db.commit()
    await db.refresh(comment)

    u_up = (await db.execute(select(UserPoints.total_points).where(UserPoints.user_id == user.id))).scalar_one_or_none()
    return CommentResponse(
        id=str(comment.id),
        author=_author(user.id, user.nickname, user.plan, u_up),
        content=comment.content,
        like_count=comment.like_count,
        parent_id=str(comment.parent_id) if comment.parent_id else None,
        created_at=str(comment.created_at),
    )


@router.delete("/{post_id}/comments/{comment_id}")
async def delete_comment(
    post_id: str,
    comment_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    comment = await db.get(Comment, UUID(comment_id))
    if not comment or str(comment.user_id) != str(user.id):
        raise HTTPException(404, "댓글을 찾을 수 없습니다.")

    comment.is_deleted = True
    comment.content = "(삭제된 댓글입니다)"
    # Decrement post comment count
    post = await db.get(Post, UUID(post_id))
    if post and post.comment_count > 0:
        post.comment_count -= 1
    await db.commit()
    return {"ok": True}


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
    # Notify strategy owner
    await create_notification(
        db, user_id=strategy.user_id, actor_id=user.id,
        type="copy_strategy", target_type="post", target_id=post.id,
        message=f"{user.nickname}님이 회원님의 전략을 복사했습니다",
    )
    # Award points to strategy owner and copier
    try:
        from core.points import award_points
        await award_points(db, strategy.user_id, "strategy_copied", f"전략 복사됨: {strategy.name[:30]}")
        await award_points(db, user.id, "marketplace_copy", f"마켓 전략 복사: {strategy.name[:30]}")
    except Exception:
        pass
    await db.commit()
    await db.refresh(new_strategy)

    return {"strategy_id": str(new_strategy.id), "message": "전략이 복사되었습니다."}


# ─── Reactions ───────────────────────────────────────────────────────────────

class ReactionRequest(BaseModel):
    emoji: str  # fire, rocket, eyes, thinking, thumbsup, heart


class ReactionCountItem(BaseModel):
    emoji: str
    count: int
    reacted: bool = False


@router.post("/{post_id}/react")
async def toggle_reaction(
    post_id: str,
    req: ReactionRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    allowed_emojis = {"thumbsup", "heart", "fire", "rocket", "eyes", "thinking"}
    if req.emoji not in allowed_emojis:
        raise HTTPException(400, "허용되지 않는 이모지입니다.")

    pid = UUID(post_id)
    stmt = select(Reaction).where(
        Reaction.user_id == user.id,
        Reaction.target_type == "post",
        Reaction.target_id == pid,
        Reaction.emoji == req.emoji,
    )
    existing = (await db.execute(stmt)).scalar_one_or_none()

    if existing:
        await db.delete(existing)
        await db.commit()
        return {"reacted": False, "emoji": req.emoji}
    else:
        db.add(Reaction(
            user_id=user.id,
            target_type="post",
            target_id=pid,
            emoji=req.emoji,
        ))
        await db.commit()
        return {"reacted": True, "emoji": req.emoji}


@router.get("/{post_id}/reactions", response_model=list[ReactionCountItem])
async def get_reactions(
    post_id: str,
    current_user: User | None = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db),
):
    pid = UUID(post_id)
    # Counts per emoji
    stmt = (
        select(Reaction.emoji, func.count().label("cnt"))
        .where(Reaction.target_type == "post", Reaction.target_id == pid)
        .group_by(Reaction.emoji)
    )
    rows = (await db.execute(stmt)).all()

    # Which emojis current user reacted with
    my_emojis: set = set()
    if current_user:
        my_stmt = select(Reaction.emoji).where(
            Reaction.user_id == current_user.id,
            Reaction.target_type == "post",
            Reaction.target_id == pid,
        )
        my_emojis = {r[0] for r in (await db.execute(my_stmt)).all()}

    return [
        ReactionCountItem(emoji=emoji, count=cnt, reacted=emoji in my_emojis)
        for emoji, cnt in rows
    ]


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _author(user_id, nickname: str, plan: str, total_points) -> AuthorInfo:
    """Build AuthorInfo with computed level."""
    lv, lv_name = compute_level(total_points or 0)
    return AuthorInfo(id=str(user_id), nickname=nickname, plan=plan, level=lv, level_name=lv_name)


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

    # Fetch author level
    up = (await db.execute(select(UserPoints.total_points).where(UserPoints.user_id == author.id))).scalar_one_or_none()

    return PostResponse(
        id=str(post.id),
        author=_author(author.id, author.nickname, author.plan, up),
        category=post.category,
        title=post.title,
        content=post.content,
        content_format=getattr(post, 'content_format', None) or "plain",
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
