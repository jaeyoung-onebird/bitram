"""
Direct Message (DM) API: conversations, messages, read status, unread count.
"""
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, update, or_, and_
from uuid import UUID

from db.database import get_db
from db.models import Conversation, DirectMessage, User, Block
from api.deps import get_current_user
from core.sanitizer import sanitize_text
from middleware.rate_limit import rate_limit

router = APIRouter(prefix="/api/dm", tags=["dm"])


# ─── Request / Response Schemas ──────────────────────────────────────────────

class StartConversationRequest(BaseModel):
    user_id: str


class SendMessageRequest(BaseModel):
    content: str


class ParticipantInfo(BaseModel):
    id: str
    nickname: str
    avatar_url: str | None = None


class ConversationListItem(BaseModel):
    id: str
    other_user: ParticipantInfo
    last_message: str | None = None
    last_message_at: str | None = None
    unread_count: int = 0


class MessageItem(BaseModel):
    id: str
    sender_id: str
    content: str
    is_read: bool
    created_at: str


# ─── List Conversations ─────────────────────────────────────────────────────

@router.get("/conversations", response_model=list[ConversationListItem])
async def list_conversations(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List user's conversations with last message preview, ordered by last_message_at desc."""
    stmt = (
        select(Conversation)
        .where(
            or_(
                Conversation.participant_a == user.id,
                Conversation.participant_b == user.id,
            )
        )
        .order_by(Conversation.last_message_at.desc())
    )
    result = await db.execute(stmt)
    conversations = result.scalars().all()

    items: list[ConversationListItem] = []
    for conv in conversations:
        # Determine the other participant
        other_id = conv.participant_b if conv.participant_a == user.id else conv.participant_a
        other_user = await db.get(User, other_id)
        if not other_user:
            continue

        # Last message preview
        last_msg_stmt = (
            select(DirectMessage)
            .where(DirectMessage.conversation_id == conv.id)
            .order_by(DirectMessage.created_at.desc())
            .limit(1)
        )
        last_msg = (await db.execute(last_msg_stmt)).scalar_one_or_none()

        # Unread count (messages sent by the other user that are unread)
        unread_stmt = (
            select(func.count())
            .select_from(DirectMessage)
            .where(
                DirectMessage.conversation_id == conv.id,
                DirectMessage.sender_id != user.id,
                DirectMessage.is_read == False,
            )
        )
        unread_count = (await db.execute(unread_stmt)).scalar() or 0

        items.append(ConversationListItem(
            id=str(conv.id),
            other_user=ParticipantInfo(
                id=str(other_user.id),
                nickname=other_user.nickname,
                avatar_url=other_user.avatar_url,
            ),
            last_message=last_msg.content[:100] if last_msg else None,
            last_message_at=str(conv.last_message_at) if conv.last_message_at else None,
            unread_count=unread_count,
        ))

    return items


# ─── Start / Get Conversation ────────────────────────────────────────────────

@router.post("/conversations", response_model=ConversationListItem)
async def start_conversation(
    req: StartConversationRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Start a new conversation or return existing one between two users."""
    target_id = UUID(req.user_id)

    if target_id == user.id:
        raise HTTPException(400, "자기 자신에게 메시지를 보낼 수 없습니다.")

    # Check target user exists
    target_user = await db.get(User, target_id)
    if not target_user:
        raise HTTPException(404, "사용자를 찾을 수 없습니다.")

    # Check if blocked
    block_stmt = select(Block).where(
        or_(
            and_(Block.blocker_id == target_id, Block.blocked_id == user.id),
            and_(Block.blocker_id == user.id, Block.blocked_id == target_id),
        )
    )
    block = (await db.execute(block_stmt)).scalar_one_or_none()
    if block:
        raise HTTPException(403, "차단된 사용자와는 대화할 수 없습니다.")

    # Sort UUIDs for consistent lookup (participant_a < participant_b)
    a_id, b_id = sorted([user.id, target_id], key=lambda x: str(x))

    # Check if conversation already exists
    existing_stmt = select(Conversation).where(
        Conversation.participant_a == a_id,
        Conversation.participant_b == b_id,
    )
    existing = (await db.execute(existing_stmt)).scalar_one_or_none()

    if existing:
        conv = existing
    else:
        conv = Conversation(
            participant_a=a_id,
            participant_b=b_id,
            last_message_at=datetime.now(timezone.utc),
        )
        db.add(conv)
        await db.commit()
        await db.refresh(conv)

    return ConversationListItem(
        id=str(conv.id),
        other_user=ParticipantInfo(
            id=str(target_user.id),
            nickname=target_user.nickname,
            avatar_url=target_user.avatar_url,
        ),
        last_message=None,
        last_message_at=str(conv.last_message_at) if conv.last_message_at else None,
        unread_count=0,
    )


# ─── Get Messages ────────────────────────────────────────────────────────────

@router.get("/conversations/{conversation_id}/messages", response_model=list[MessageItem])
async def get_messages(
    conversation_id: str,
    page: int = Query(1, ge=1),
    size: int = Query(30, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get messages in a conversation, paginated, ordered by created_at desc."""
    conv_id = UUID(conversation_id)

    # Verify user is a participant
    conv = await db.get(Conversation, conv_id)
    if not conv:
        raise HTTPException(404, "대화를 찾을 수 없습니다.")
    if user.id not in (conv.participant_a, conv.participant_b):
        raise HTTPException(403, "이 대화에 접근할 수 없습니다.")

    stmt = (
        select(DirectMessage)
        .where(DirectMessage.conversation_id == conv_id)
        .order_by(DirectMessage.created_at.desc())
        .offset((page - 1) * size)
        .limit(size)
    )
    result = await db.execute(stmt)
    messages = result.scalars().all()

    return [
        MessageItem(
            id=str(msg.id),
            sender_id=str(msg.sender_id),
            content=msg.content,
            is_read=msg.is_read,
            created_at=str(msg.created_at),
        )
        for msg in messages
    ]


# ─── Send Message ────────────────────────────────────────────────────────────

@router.post("/conversations/{conversation_id}/messages", response_model=MessageItem)
@rate_limit(max_calls=20, period=60, key_func="user")
async def send_message(
    conversation_id: str,
    req: SendMessageRequest,
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Send a message in a conversation. Rate limited to 20/min/user."""
    conv_id = UUID(conversation_id)

    # Verify user is a participant
    conv = await db.get(Conversation, conv_id)
    if not conv:
        raise HTTPException(404, "대화를 찾을 수 없습니다.")
    if user.id not in (conv.participant_a, conv.participant_b):
        raise HTTPException(403, "이 대화에 접근할 수 없습니다.")

    # Check if blocked
    other_id = conv.participant_b if conv.participant_a == user.id else conv.participant_a
    block_stmt = select(Block).where(
        or_(
            and_(Block.blocker_id == other_id, Block.blocked_id == user.id),
            and_(Block.blocker_id == user.id, Block.blocked_id == other_id),
        )
    )
    block = (await db.execute(block_stmt)).scalar_one_or_none()
    if block:
        raise HTTPException(403, "차단된 사용자와는 대화할 수 없습니다.")

    # Sanitize content
    content = sanitize_text(req.content)
    if not content or not content.strip():
        raise HTTPException(400, "메시지 내용을 입력해주세요.")

    now = datetime.now(timezone.utc)

    msg = DirectMessage(
        conversation_id=conv_id,
        sender_id=user.id,
        content=content.strip(),
    )
    db.add(msg)

    # Update conversation last_message_at
    conv.last_message_at = now

    await db.commit()
    await db.refresh(msg)

    return MessageItem(
        id=str(msg.id),
        sender_id=str(msg.sender_id),
        content=msg.content,
        is_read=msg.is_read,
        created_at=str(msg.created_at),
    )


# ─── Mark as Read ────────────────────────────────────────────────────────────

@router.post("/conversations/{conversation_id}/read")
async def mark_messages_read(
    conversation_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Mark all messages as read where sender != current_user."""
    conv_id = UUID(conversation_id)

    # Verify user is a participant
    conv = await db.get(Conversation, conv_id)
    if not conv:
        raise HTTPException(404, "대화를 찾을 수 없습니다.")
    if user.id not in (conv.participant_a, conv.participant_b):
        raise HTTPException(403, "이 대화에 접근할 수 없습니다.")

    await db.execute(
        update(DirectMessage)
        .where(
            DirectMessage.conversation_id == conv_id,
            DirectMessage.sender_id != user.id,
            DirectMessage.is_read == False,
        )
        .values(is_read=True)
    )
    await db.commit()
    return {"ok": True}


# ─── Unread Count ────────────────────────────────────────────────────────────

@router.get("/unread-count")
async def total_unread_count(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Total unread DM count across all conversations."""
    # Get all conversation IDs where user is a participant
    conv_ids_stmt = (
        select(Conversation.id)
        .where(
            or_(
                Conversation.participant_a == user.id,
                Conversation.participant_b == user.id,
            )
        )
    )
    conv_ids = [row[0] for row in (await db.execute(conv_ids_stmt)).all()]

    if not conv_ids:
        return {"count": 0}

    unread_stmt = (
        select(func.count())
        .select_from(DirectMessage)
        .where(
            DirectMessage.conversation_id.in_(conv_ids),
            DirectMessage.sender_id != user.id,
            DirectMessage.is_read == False,
        )
    )
    count = (await db.execute(unread_stmt)).scalar() or 0
    return {"count": count}
