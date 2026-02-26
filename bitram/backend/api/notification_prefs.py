"""
Notification Preferences API: get and update user notification preferences.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from db.database import get_db
from db.models import User, UserNotificationPreference
from api.deps import get_current_user

router = APIRouter(prefix="/api/notifications/preferences", tags=["notification_prefs"])


# ─── Schemas ─────────────────────────────────────────────────────────────────

class NotificationPrefsResponse(BaseModel):
    email_on_like: bool = False
    email_on_comment: bool = True
    email_on_follow: bool = True
    email_on_dm: bool = True
    email_weekly_digest: bool = True
    push_on_like: bool = True
    push_on_comment: bool = True
    push_on_follow: bool = True
    push_on_dm: bool = True


class NotificationPrefsUpdateRequest(BaseModel):
    email_on_like: bool | None = None
    email_on_comment: bool | None = None
    email_on_follow: bool | None = None
    email_on_dm: bool | None = None
    email_weekly_digest: bool | None = None
    push_on_like: bool | None = None
    push_on_comment: bool | None = None
    push_on_follow: bool | None = None
    push_on_dm: bool | None = None


# ─── Get Preferences ────────────────────────────────────────────────────────

@router.get("", response_model=NotificationPrefsResponse)
async def get_preferences(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get user notification preferences. Creates defaults if not exists."""
    stmt = select(UserNotificationPreference).where(
        UserNotificationPreference.user_id == user.id
    )
    prefs = (await db.execute(stmt)).scalar_one_or_none()

    if not prefs:
        # Create default preferences
        prefs = UserNotificationPreference(user_id=user.id)
        db.add(prefs)
        await db.commit()
        await db.refresh(prefs)

    return NotificationPrefsResponse(
        email_on_like=prefs.email_on_like,
        email_on_comment=prefs.email_on_comment,
        email_on_follow=prefs.email_on_follow,
        email_on_dm=prefs.email_on_dm,
        email_weekly_digest=prefs.email_weekly_digest,
        push_on_like=prefs.push_on_like,
        push_on_comment=prefs.push_on_comment,
        push_on_follow=prefs.push_on_follow,
        push_on_dm=prefs.push_on_dm,
    )


# ─── Update Preferences ─────────────────────────────────────────────────────

@router.put("", response_model=NotificationPrefsResponse)
async def update_preferences(
    req: NotificationPrefsUpdateRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update user notification preferences."""
    stmt = select(UserNotificationPreference).where(
        UserNotificationPreference.user_id == user.id
    )
    prefs = (await db.execute(stmt)).scalar_one_or_none()

    if not prefs:
        # Create default preferences first
        prefs = UserNotificationPreference(user_id=user.id)
        db.add(prefs)
        await db.flush()

    # Update only provided fields
    update_data = req.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        if value is not None:
            setattr(prefs, field, value)

    await db.commit()
    await db.refresh(prefs)

    return NotificationPrefsResponse(
        email_on_like=prefs.email_on_like,
        email_on_comment=prefs.email_on_comment,
        email_on_follow=prefs.email_on_follow,
        email_on_dm=prefs.email_on_dm,
        email_weekly_digest=prefs.email_weekly_digest,
        push_on_like=prefs.push_on_like,
        push_on_comment=prefs.push_on_comment,
        push_on_follow=prefs.push_on_follow,
        push_on_dm=prefs.push_on_dm,
    )
