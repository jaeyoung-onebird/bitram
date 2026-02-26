"""
Telegram connection API: generate verification code, disconnect
"""
import secrets
import redis.asyncio as aioredis
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from db.database import get_db
from db.models import User
from api.deps import get_current_user
from config import get_settings

router = APIRouter(prefix="/api/telegram", tags=["telegram"])

settings = get_settings()

VERIFY_CODE_PREFIX = "tg_verify:"
VERIFY_CODE_TTL = 300  # 5 minutes


async def get_redis():
    r = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    try:
        yield r
    finally:
        await r.aclose()


class CodeResponse(BaseModel):
    code: str
    expires_in: int = VERIFY_CODE_TTL


@router.post("/generate-code", response_model=CodeResponse)
async def generate_verification_code(
    user: User = Depends(get_current_user),
    r: aioredis.Redis = Depends(get_redis),
):
    """Generate a 6-digit verification code for Telegram linking."""
    code = f"{secrets.randbelow(900000) + 100000}"

    # Store code -> user_id mapping
    await r.setex(f"{VERIFY_CODE_PREFIX}{code}", VERIFY_CODE_TTL, str(user.id))
    # Also store reverse mapping so we can invalidate old codes
    old_code = await r.get(f"tg_user_code:{user.id}")
    if old_code:
        await r.delete(f"{VERIFY_CODE_PREFIX}{old_code}")
    await r.setex(f"tg_user_code:{user.id}", VERIFY_CODE_TTL, code)

    return CodeResponse(code=code)


@router.post("/disconnect")
async def disconnect_telegram(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Remove Telegram connection from account."""
    if not user.telegram_chat_id:
        raise HTTPException(400, "텔레그램이 연동되어 있지 않습니다.")

    user.telegram_chat_id = None
    await db.commit()
    return {"status": "disconnected"}
