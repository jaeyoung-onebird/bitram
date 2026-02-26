"""
Email sending utility using SMTP.
"""
import logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

import aiosmtplib

from config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


async def _send_email(to: str, subject: str, html_body: str) -> bool:
    if not settings.SMTP_HOST:
        logger.warning("SMTP not configured, skipping email send")
        return False

    msg = MIMEMultipart("alternative")
    msg["From"] = f"BITRAM <{settings.SMTP_FROM_EMAIL}>"
    msg["To"] = to
    msg["Subject"] = subject
    msg.attach(MIMEText(html_body, "html", "utf-8"))

    try:
        await aiosmtplib.send(
            msg,
            hostname=settings.SMTP_HOST,
            port=settings.SMTP_PORT,
            username=settings.SMTP_USER,
            password=settings.SMTP_PASSWORD,
            use_tls=settings.SMTP_PORT == 465,
            start_tls=settings.SMTP_PORT == 587,
        )
        logger.info(f"Email sent to {to}")
        return True
    except Exception as e:
        logger.error(f"Failed to send email to {to}: {e}")
        return False


async def send_verification_email(to: str, token: str, nickname: str) -> bool:
    verify_url = f"{settings.FRONTEND_URL}/verify-email?token={token}"
    html = f"""
    <div style="max-width:480px;margin:0 auto;font-family:-apple-system,sans-serif;padding:32px">
        <h2 style="color:#2563eb">BITRAM 이메일 인증</h2>
        <p>{nickname}님, 안녕하세요!</p>
        <p>아래 버튼을 클릭하여 이메일 인증을 완료해주세요.</p>
        <a href="{verify_url}"
           style="display:inline-block;padding:12px 32px;background:#2563eb;color:#fff;
                  text-decoration:none;border-radius:8px;margin:16px 0;font-weight:600">
            이메일 인증하기
        </a>
        <p style="color:#6b7280;font-size:13px">
            버튼이 작동하지 않으면 아래 링크를 복사하여 브라우저에 붙여넣으세요:<br>
            <a href="{verify_url}" style="color:#2563eb">{verify_url}</a>
        </p>
        <p style="color:#9ca3af;font-size:12px">이 링크는 24시간 후 만료됩니다.</p>
    </div>
    """
    return await _send_email(to, "[BITRAM] 이메일 인증", html)


async def send_password_reset_email(to: str, token: str, nickname: str) -> bool:
    reset_url = f"{settings.FRONTEND_URL}/reset-password?token={token}"
    html = f"""
    <div style="max-width:480px;margin:0 auto;font-family:-apple-system,sans-serif;padding:32px">
        <h2 style="color:#2563eb">BITRAM 비밀번호 재설정</h2>
        <p>{nickname}님, 안녕하세요!</p>
        <p>비밀번호 재설정을 요청하셨습니다. 아래 버튼을 클릭하여 새 비밀번호를 설정해주세요.</p>
        <a href="{reset_url}"
           style="display:inline-block;padding:12px 32px;background:#2563eb;color:#fff;
                  text-decoration:none;border-radius:8px;margin:16px 0;font-weight:600">
            비밀번호 재설정
        </a>
        <p style="color:#6b7280;font-size:13px">
            버튼이 작동하지 않으면 아래 링크를 복사하여 브라우저에 붙여넣으세요:<br>
            <a href="{reset_url}" style="color:#2563eb">{reset_url}</a>
        </p>
        <p style="color:#9ca3af;font-size:12px">이 링크는 1시간 후 만료됩니다.</p>
        <p style="color:#9ca3af;font-size:12px">본인이 요청하지 않았다면 이 이메일을 무시하세요.</p>
    </div>
    """
    return await _send_email(to, "[BITRAM] 비밀번호 재설정", html)


async def send_weekly_digest_email(to: str, nickname: str, stats: dict) -> bool:
    html = f"""
    <div style="max-width:480px;margin:0 auto;font-family:-apple-system,sans-serif;padding:32px">
        <h2 style="color:#2563eb">BITRAM 주간 리포트</h2>
        <p>{nickname}님, 이번 주 활동을 정리해드립니다.</p>
        <div style="background:#f8fafc;padding:16px;border-radius:8px;margin:16px 0">
            <p>새 팔로워: <strong>{stats.get('new_followers', 0)}명</strong></p>
            <p>받은 좋아요: <strong>{stats.get('likes_received', 0)}개</strong></p>
            <p>새 댓글: <strong>{stats.get('comments_received', 0)}개</strong></p>
            <p>인기 게시글: <strong>{stats.get('trending_posts', 0)}개</strong></p>
        </div>
        <a href="{settings.FRONTEND_URL}/dashboard"
           style="display:inline-block;padding:12px 32px;background:#2563eb;color:#fff;
                  text-decoration:none;border-radius:8px;font-weight:600">
            대시보드 바로가기
        </a>
    </div>
    """
    return await _send_email(to, "[BITRAM] 이번 주 활동 리포트", html)
