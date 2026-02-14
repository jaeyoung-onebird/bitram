"""
Moderation API: report, block/unblock, admin actions.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, update, func
from uuid import UUID

from db.database import get_db
from db.models import User, Post, Comment, Report, Block, Badge, Notification
from api.deps import get_current_user, get_current_admin

router = APIRouter(prefix="/api/moderation", tags=["moderation"])


# ─── Report ─────────────────────────────────────────────────────────────────

class ReportRequest(BaseModel):
    target_type: str  # post, comment, user
    target_id: str
    reason: str  # spam, scam, harassment, inappropriate, other
    description: str | None = None


@router.post("/report")
async def create_report(
    req: ReportRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if req.target_type not in ("post", "comment", "user"):
        raise HTTPException(400, "유효하지 않은 신고 대상입니다.")
    if req.reason not in ("spam", "scam", "harassment", "inappropriate", "other"):
        raise HTTPException(400, "유효하지 않은 신고 사유입니다.")

    report = Report(
        reporter_id=user.id,
        target_type=req.target_type,
        target_id=UUID(req.target_id),
        reason=req.reason,
        description=req.description,
    )
    db.add(report)
    await db.commit()
    return {"ok": True, "message": "신고가 접수되었습니다."}


# ─── Block / Unblock ────────────────────────────────────────────────────────

@router.post("/block/{target_user_id}")
async def block_user(
    target_user_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if target_user_id == str(user.id):
        raise HTTPException(400, "자기 자신을 차단할 수 없습니다.")
    target_uuid = UUID(target_user_id)
    existing = (await db.execute(
        select(Block).where(Block.blocker_id == user.id, Block.blocked_id == target_uuid)
    )).scalar_one_or_none()
    if existing:
        return {"ok": True, "blocked": True}
    db.add(Block(blocker_id=user.id, blocked_id=target_uuid))
    await db.commit()
    return {"ok": True, "blocked": True}


@router.delete("/block/{target_user_id}")
async def unblock_user(
    target_user_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await db.execute(
        delete(Block).where(Block.blocker_id == user.id, Block.blocked_id == UUID(target_user_id))
    )
    await db.commit()
    return {"ok": True, "blocked": False}


@router.get("/blocked")
async def list_blocked(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(User.id, User.nickname)
        .join(Block, Block.blocked_id == User.id)
        .where(Block.blocker_id == user.id)
    )
    rows = (await db.execute(stmt)).all()
    return [{"user_id": str(r.id), "nickname": r.nickname} for r in rows]


# ─── Admin Moderation ───────────────────────────────────────────────────────

@router.get("/reports")
async def list_reports(
    status: str = Query("pending", pattern="^(pending|reviewed|dismissed|all)$"),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=50),
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Report, User.nickname).join(User, Report.reporter_id == User.id)
    if status != "all":
        stmt = stmt.where(Report.status == status)
    stmt = stmt.order_by(Report.created_at.desc()).offset((page - 1) * size).limit(size)
    rows = (await db.execute(stmt)).all()
    return [
        {
            "id": str(r.id),
            "reporter": nick,
            "target_type": r.target_type,
            "target_id": str(r.target_id),
            "reason": r.reason,
            "description": r.description,
            "status": r.status,
            "created_at": str(r.created_at),
        }
        for r, nick in rows
    ]


@router.post("/reports/{report_id}/review")
async def review_report(
    report_id: str,
    action: str = Query(..., pattern="^(reviewed|dismissed)$"),
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    await db.execute(
        update(Report).where(Report.id == UUID(report_id)).values(status=action)
    )
    await db.commit()
    return {"ok": True}


@router.post("/admin/pin/{post_id}")
async def toggle_pin(
    post_id: str,
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    post = await db.get(Post, UUID(post_id))
    if not post:
        raise HTTPException(404, "게시글을 찾을 수 없습니다.")
    post.is_pinned = not post.is_pinned
    await db.commit()
    return {"ok": True, "is_pinned": post.is_pinned}


@router.delete("/admin/post/{post_id}")
async def admin_delete_post(
    post_id: str,
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    post = await db.get(Post, UUID(post_id))
    if not post:
        raise HTTPException(404, "게시글을 찾을 수 없습니다.")
    await db.delete(post)
    await db.commit()
    return {"ok": True, "message": "관리자에 의해 삭제되었습니다."}


@router.delete("/admin/comment/{comment_id}")
async def admin_delete_comment(
    comment_id: str,
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    comment = await db.get(Comment, UUID(comment_id))
    if not comment:
        raise HTTPException(404, "댓글을 찾을 수 없습니다.")
    comment.is_deleted = True
    comment.content = "(관리자에 의해 삭제된 댓글입니다)"
    # Decrement post comment count
    post = await db.get(Post, comment.post_id)
    if post and post.comment_count > 0:
        post.comment_count -= 1
    await db.commit()
    return {"ok": True}


# ─── Badges (Admin) ─────────────────────────────────────────────────────────

BADGE_TYPES = {
    "verified_trader": "인증 트레이더",
    "consistent_profit": "꾸준한 수익",
    "top_contributor": "탑 기여자",
    "strategy_master": "전략 마스터",
    "early_adopter": "얼리 어답터",
    "helpful": "도움왕",
}


@router.post("/admin/badge/{user_id}")
async def award_badge(
    user_id: str,
    badge_type: str = Query(...),
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    if badge_type not in BADGE_TYPES:
        raise HTTPException(400, f"유효하지 않은 뱃지입니다. 사용 가능: {list(BADGE_TYPES.keys())}")

    existing = (await db.execute(
        select(Badge).where(Badge.user_id == UUID(user_id), Badge.type == badge_type)
    )).scalar_one_or_none()
    if existing:
        return {"ok": True, "message": "이미 부여된 뱃지입니다."}

    db.add(Badge(user_id=UUID(user_id), type=badge_type, label=BADGE_TYPES[badge_type]))
    await db.commit()
    return {"ok": True, "message": f"'{BADGE_TYPES[badge_type]}' 뱃지가 부여되었습니다."}


@router.get("/badges/{user_id}")
async def get_user_badges(
    user_id: str,
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Badge).where(Badge.user_id == UUID(user_id)).order_by(Badge.awarded_at.desc())
    rows = (await db.execute(stmt)).scalars().all()
    return [
        {"type": b.type, "label": b.label, "awarded_at": str(b.awarded_at)}
        for b in rows
    ]
