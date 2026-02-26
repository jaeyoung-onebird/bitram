"""
Sub-Community API: list, detail, posts, join, leave.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, update
from uuid import UUID

from db.database import get_db
from db.models import SubCommunity, SubCommunityMember, Post, User, UserPoints
from api.deps import get_current_user, get_current_user_optional
from core.points import compute_level

router = APIRouter(prefix="/api/communities", tags=["communities"])


# ─── Response Schemas ────────────────────────────────────────────────────────

class CommunityListItem(BaseModel):
    id: str
    slug: str
    name: str
    description: str | None = None
    icon_url: str | None = None
    coin_pair: str | None = None
    member_count: int = 0
    post_count: int = 0


class CommunityDetail(BaseModel):
    id: str
    slug: str
    name: str
    description: str | None = None
    icon_url: str | None = None
    coin_pair: str | None = None
    member_count: int = 0
    post_count: int = 0
    is_member: bool = False
    created_at: str


class AuthorInfo(BaseModel):
    id: str
    nickname: str
    plan: str = "community"
    level: int = 1


class CommunityPostItem(BaseModel):
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


# ─── List Communities ────────────────────────────────────────────────────────

@router.get("", response_model=list[CommunityListItem])
async def list_communities(
    q: str | None = Query(None, min_length=1, max_length=100),
    db: AsyncSession = Depends(get_db),
):
    """List all sub-communities with member_count, post_count. Optional search param q."""
    stmt = select(SubCommunity).order_by(SubCommunity.member_count.desc())

    if q:
        search = f"%{q}%"
        stmt = stmt.where(
            SubCommunity.name.ilike(search)
            | SubCommunity.slug.ilike(search)
            | SubCommunity.description.ilike(search)
        )

    result = await db.execute(stmt)
    communities = result.scalars().all()

    return [
        CommunityListItem(
            id=str(c.id),
            slug=c.slug,
            name=c.name,
            description=c.description,
            icon_url=c.icon_url,
            coin_pair=c.coin_pair,
            member_count=c.member_count or 0,
            post_count=c.post_count or 0,
        )
        for c in communities
    ]


# ─── Community Detail ────────────────────────────────────────────────────────

@router.get("/{slug}", response_model=CommunityDetail)
async def get_community(
    slug: str,
    current_user: User | None = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db),
):
    """Get sub-community detail."""
    stmt = select(SubCommunity).where(SubCommunity.slug == slug)
    community = (await db.execute(stmt)).scalar_one_or_none()
    if not community:
        raise HTTPException(404, "커뮤니티를 찾을 수 없습니다.")

    # Check membership
    is_member = False
    if current_user:
        member_stmt = select(SubCommunityMember).where(
            SubCommunityMember.user_id == current_user.id,
            SubCommunityMember.sub_community_id == community.id,
        )
        is_member = (await db.execute(member_stmt)).scalar_one_or_none() is not None

    return CommunityDetail(
        id=str(community.id),
        slug=community.slug,
        name=community.name,
        description=community.description,
        icon_url=community.icon_url,
        coin_pair=community.coin_pair,
        member_count=community.member_count or 0,
        post_count=community.post_count or 0,
        is_member=is_member,
        created_at=str(community.created_at),
    )


# ─── Community Posts ─────────────────────────────────────────────────────────

@router.get("/{slug}/posts", response_model=list[CommunityPostItem])
async def list_community_posts(
    slug: str,
    category: str | None = None,
    sort: str = Query("latest", pattern="^(latest|popular|most_commented)$"),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
):
    """Get posts in a sub-community, paginated."""
    # Find community by slug
    community = (
        await db.execute(select(SubCommunity).where(SubCommunity.slug == slug))
    ).scalar_one_or_none()
    if not community:
        raise HTTPException(404, "커뮤니티를 찾을 수 없습니다.")

    stmt = (
        select(Post, User.nickname, User.plan, UserPoints.total_points)
        .join(User, Post.user_id == User.id)
        .outerjoin(UserPoints, UserPoints.user_id == Post.user_id)
        .where(Post.sub_community_id == community.id)
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
        CommunityPostItem(
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


# ─── Join Community ──────────────────────────────────────────────────────────

@router.post("/{slug}/join")
async def join_community(
    slug: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Join a sub-community."""
    community = (
        await db.execute(select(SubCommunity).where(SubCommunity.slug == slug))
    ).scalar_one_or_none()
    if not community:
        raise HTTPException(404, "커뮤니티를 찾을 수 없습니다.")

    # Check if already a member
    existing = (
        await db.execute(
            select(SubCommunityMember).where(
                SubCommunityMember.user_id == user.id,
                SubCommunityMember.sub_community_id == community.id,
            )
        )
    ).scalar_one_or_none()

    if existing:
        raise HTTPException(400, "이미 가입한 커뮤니티입니다.")

    member = SubCommunityMember(
        user_id=user.id,
        sub_community_id=community.id,
    )
    db.add(member)

    # Increment member_count
    community.member_count = (community.member_count or 0) + 1

    await db.commit()
    return {"ok": True, "message": "커뮤니티에 가입했습니다."}


# ─── Leave Community ─────────────────────────────────────────────────────────

@router.delete("/{slug}/leave")
async def leave_community(
    slug: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Leave a sub-community."""
    community = (
        await db.execute(select(SubCommunity).where(SubCommunity.slug == slug))
    ).scalar_one_or_none()
    if not community:
        raise HTTPException(404, "커뮤니티를 찾을 수 없습니다.")

    member = (
        await db.execute(
            select(SubCommunityMember).where(
                SubCommunityMember.user_id == user.id,
                SubCommunityMember.sub_community_id == community.id,
            )
        )
    ).scalar_one_or_none()

    if not member:
        raise HTTPException(400, "가입하지 않은 커뮤니티입니다.")

    await db.delete(member)

    # Decrement member_count
    if community.member_count and community.member_count > 0:
        community.member_count -= 1

    await db.commit()
    return {"ok": True, "message": "커뮤니티에서 탈퇴했습니다."}


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _author(user_id, nickname: str, plan: str, total_points) -> AuthorInfo:
    """Build AuthorInfo with computed level."""
    lv = compute_level(total_points or 0)
    return AuthorInfo(id=str(user_id), nickname=nickname, plan=plan, level=lv)
