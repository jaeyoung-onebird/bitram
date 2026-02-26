"""
Celery tasks for sending emails asynchronously.
"""
import asyncio
from tasks.celery_app import app as celery_app


def _run_async(coro):
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


@celery_app.task(name="send_verification_email")
def send_verification_email_task(to: str, token: str, nickname: str):
    from core.email import send_verification_email
    _run_async(send_verification_email(to, token, nickname))


@celery_app.task(name="send_password_reset_email")
def send_password_reset_email_task(to: str, token: str, nickname: str):
    from core.email import send_password_reset_email
    _run_async(send_password_reset_email(to, token, nickname))


@celery_app.task(name="send_weekly_digest_email")
def send_weekly_digest_email_task(to: str, nickname: str, stats: dict):
    from core.email import send_weekly_digest_email
    _run_async(send_weekly_digest_email(to, nickname, stats))


@celery_app.task(name="send_notification_email")
def send_notification_email_task(to: str, nickname: str, notif_type: str, message: str):
    from core.email import _send_email
    type_labels = {
        "like": "좋아요", "comment": "댓글", "reply": "답글",
        "mention": "멘션", "follow": "팔로우", "dm": "메시지",
    }
    label = type_labels.get(notif_type, "알림")
    html = f"""
    <div style="max-width:480px;margin:0 auto;font-family:-apple-system,sans-serif;padding:32px">
        <h2 style="color:#2563eb">BITRAM 알림</h2>
        <p>{nickname}님, 새로운 {label} 알림이 있습니다.</p>
        <div style="background:#f8fafc;padding:16px;border-radius:8px;margin:16px 0">
            <p>{message}</p>
        </div>
        <a href="https://bitram.co.kr/notifications"
           style="display:inline-block;padding:12px 32px;background:#2563eb;color:#fff;
                  text-decoration:none;border-radius:8px;font-weight:600">
            확인하기
        </a>
    </div>
    """
    _run_async(_send_email(to, f"[BITRAM] 새로운 {label} 알림", html))
