"""
Follow API: follow/unfollow users and list followers/following.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, delete
from uuid import UUID

from db.database import get_db
from db.models import User, Follow
from api.deps import get_current_user
from api.notifications import create_notification

router = APIRouter(prefix="/api/follows", tags=["follows"])


@router.post("/{target_user_id}")
async def follow_user(
    target_user_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if target_user_id == str(user.id):
        raise HTTPException(400, "자기 자신을 팔로우할 수 없습니다.")

    try:
        target_uuid = UUID(target_user_id)
    except Exception:
        raise HTTPException(400, "유효하지 않은 사용자 ID입니다.")

    target = (await db.execute(select(User).where(User.id == target_uuid))).scalar_one_or_none()
    if not target or not target.is_active:
        raise HTTPException(404, "사용자를 찾을 수 없습니다.")

    exists = (await db.execute(
        select(Follow).where(Follow.follower_id == user.id, Follow.following_id == target_uuid)
    )).scalar_one_or_none()
    if exists:
        return {"ok": True, "following": True}

    db.add(Follow(follower_id=user.id, following_id=target_uuid))
    await create_notification(
        db, user_id=target_uuid, actor_id=user.id,
        type="follow", message=f"{user.nickname}님이 회원님을 팔로우합니다",
    )

    # Award follower milestone points
    try:
        from core.points import award_points, FOLLOWER_MILESTONES
        follower_count = (await db.execute(
            select(func.count()).select_from(Follow).where(Follow.following_id == target_uuid)
        )).scalar() or 0
        new_count = follower_count + 1  # +1 for the new follow not yet flushed
        for threshold, action_key in FOLLOWER_MILESTONES:
            if new_count >= threshold:
                await award_points(db, target_uuid, action_key, f"팔로워 {threshold}명 달성 보너스")
    except Exception:
        pass

    await db.commit()
    return {"ok": True, "following": True}


@router.delete("/{target_user_id}")
async def unfollow_user(
    target_user_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        target_uuid = UUID(target_user_id)
    except Exception:
        raise HTTPException(400, "유효하지 않은 사용자 ID입니다.")

    await db.execute(
        delete(Follow).where(Follow.follower_id == user.id, Follow.following_id == target_uuid)
    )
    await db.commit()
    return {"ok": True, "following": False}


@router.get("/me")
async def my_follow_stats(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    follower_count = (await db.execute(
        select(func.count()).select_from(Follow).where(Follow.following_id == user.id)
    )).scalar() or 0
    following_count = (await db.execute(
        select(func.count()).select_from(Follow).where(Follow.follower_id == user.id)
    )).scalar() or 0
    return {"follower_count": follower_count, "following_count": following_count}


@router.get("/{user_id}/followers")
async def list_followers(
    user_id: str,
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
):
    try:
        uid = UUID(user_id)
    except Exception:
        raise HTTPException(400, "유효하지 않은 사용자 ID입니다.")

    stmt = (
        select(User.id, User.nickname)
        .join(Follow, Follow.follower_id == User.id)
        .where(Follow.following_id == uid)
        .order_by(Follow.created_at.desc())
        .offset((page - 1) * size)
        .limit(size)
    )
    rows = (await db.execute(stmt)).all()
    return [{"user_id": str(r.id), "nickname": r.nickname} for r in rows]


@router.get("/{user_id}/following")
async def list_following(
    user_id: str,
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
):
    try:
        uid = UUID(user_id)
    except Exception:
        raise HTTPException(400, "유효하지 않은 사용자 ID입니다.")

    stmt = (
        select(User.id, User.nickname)
        .join(Follow, Follow.following_id == User.id)
        .where(Follow.follower_id == uid)
        .order_by(Follow.created_at.desc())
        .offset((page - 1) * size)
        .limit(size)
    )
    rows = (await db.execute(stmt)).all()
    return [{"user_id": str(r.id), "nickname": r.nickname} for r in rows]

