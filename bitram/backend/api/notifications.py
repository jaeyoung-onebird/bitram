"""
Notification API: list, mark-read, unread count.
Also provides a helper to create notifications from other modules.
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, update
from uuid import UUID

from db.database import get_db
from db.models import User, Notification
from api.deps import get_current_user

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


async def create_notification(
    db: AsyncSession,
    *,
    user_id: UUID,
    actor_id: UUID | None,
    type: str,
    message: str,
    target_type: str | None = None,
    target_id: UUID | None = None,
):
    """Helper to create a notification. Skip if actor == user (self-action).
    Also sends email notification if user preferences allow it."""
    if actor_id and str(actor_id) == str(user_id):
        return
    notif = Notification(
        user_id=user_id,
        actor_id=actor_id,
        type=type,
        target_type=target_type,
        target_id=target_id,
        message=message,
    )
    db.add(notif)

    # Check email notification preferences and send email if enabled
    try:
        from db.models import UserNotificationPreference
        prefs_stmt = select(UserNotificationPreference).where(
            UserNotificationPreference.user_id == user_id
        )
        prefs = (await db.execute(prefs_stmt)).scalar_one_or_none()

        should_email = False
        if prefs:
            pref_map = {
                "like": prefs.email_on_like,
                "comment": prefs.email_on_comment,
                "reply": prefs.email_on_comment,
                "mention": prefs.email_on_comment,
                "follow": prefs.email_on_follow,
                "dm": prefs.email_on_dm,
            }
            should_email = pref_map.get(type, False)

        if should_email:
            user = await db.get(User, user_id)
            if user and user.email_verified:
                from tasks.email_tasks import send_notification_email_task
                send_notification_email_task.delay(user.email, user.nickname, type, message)
    except Exception:
        pass  # Email notification is best-effort


@router.get("")
async def list_notifications(
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=50),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(Notification, User.nickname)
        .outerjoin(User, Notification.actor_id == User.id)
        .where(Notification.user_id == user.id)
        .order_by(Notification.created_at.desc())
        .offset((page - 1) * size)
        .limit(size)
    )
    rows = (await db.execute(stmt)).all()
    return [
        {
            "id": str(n.id),
            "type": n.type,
            "message": n.message,
            "actor_nickname": nick,
            "target_type": n.target_type,
            "target_id": str(n.target_id) if n.target_id else None,
            "is_read": n.is_read,
            "created_at": str(n.created_at),
        }
        for n, nick in rows
    ]


@router.get("/unread-count")
async def unread_count(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(func.count())
        .select_from(Notification)
        .where(Notification.user_id == user.id, Notification.is_read == False)
    )
    count = (await db.execute(stmt)).scalar() or 0
    return {"count": count}


@router.post("/read-all")
async def mark_all_read(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await db.execute(
        update(Notification)
        .where(Notification.user_id == user.id, Notification.is_read == False)
        .values(is_read=True)
    )
    await db.commit()
    return {"ok": True}


@router.post("/{notification_id}/read")
async def mark_read(
    notification_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await db.execute(
        update(Notification)
        .where(Notification.id == UUID(notification_id), Notification.user_id == user.id)
        .values(is_read=True)
    )
    await db.commit()
    return {"ok": True}
