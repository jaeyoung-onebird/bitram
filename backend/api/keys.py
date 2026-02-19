"""
Exchange Keys API: register, verify, delete API keys
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime, timezone

from db.database import get_db
from db.models import User, ExchangeKey
from api.deps import get_current_user
from core.encryption import encrypt_key, decrypt_key
from core.upbit_client import UpbitClient

router = APIRouter(prefix="/api/keys", tags=["keys"])


class KeyRegisterRequest(BaseModel):
    access_key: str
    secret_key: str
    label: str = "기본"


class KeyResponse(BaseModel):
    id: str
    exchange: str
    label: str
    is_valid: bool
    last_verified_at: str | None
    created_at: str


@router.post("", response_model=KeyResponse)
async def register_key(
    req: KeyRegisterRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Verify key validity first, reject before saving
    client = UpbitClient(req.access_key, req.secret_key)
    is_valid = await client.verify_keys()
    await client.close()

    if not is_valid:
        raise HTTPException(400, "API 키가 유효하지 않습니다. 키를 확인해주세요.")

    key = ExchangeKey(
        user_id=user.id,
        access_key_enc=encrypt_key(req.access_key),
        secret_key_enc=encrypt_key(req.secret_key),
        label=req.label,
        is_valid=True,
        last_verified_at=datetime.now(timezone.utc),
    )
    db.add(key)
    await db.commit()
    await db.refresh(key)

    return KeyResponse(
        id=str(key.id), exchange=key.exchange, label=key.label,
        is_valid=key.is_valid, last_verified_at=str(key.last_verified_at),
        created_at=str(key.created_at),
    )


@router.get("", response_model=list[KeyResponse])
async def list_keys(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(ExchangeKey).where(ExchangeKey.user_id == user.id)
    result = await db.execute(stmt)
    keys = result.scalars().all()

    return [
        KeyResponse(
            id=str(k.id), exchange=k.exchange, label=k.label,
            is_valid=k.is_valid,
            last_verified_at=str(k.last_verified_at) if k.last_verified_at else None,
            created_at=str(k.created_at),
        ) for k in keys
    ]


@router.delete("/{key_id}")
async def delete_key(
    key_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from uuid import UUID
    stmt = select(ExchangeKey).where(ExchangeKey.id == UUID(key_id), ExchangeKey.user_id == user.id)
    result = await db.execute(stmt)
    key = result.scalar_one_or_none()
    if not key:
        raise HTTPException(404, "API 키를 찾을 수 없습니다.")

    await db.delete(key)
    await db.commit()
    return {"message": "삭제되었습니다."}


@router.post("/{key_id}/verify")
async def verify_key(
    key_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from uuid import UUID
    stmt = select(ExchangeKey).where(ExchangeKey.id == UUID(key_id), ExchangeKey.user_id == user.id)
    result = await db.execute(stmt)
    key = result.scalar_one_or_none()
    if not key:
        raise HTTPException(404, "API 키를 찾을 수 없습니다.")

    client = UpbitClient(decrypt_key(key.access_key_enc), decrypt_key(key.secret_key_enc))
    is_valid = await client.verify_keys()
    await client.close()

    key.is_valid = is_valid
    key.last_verified_at = datetime.now(timezone.utc)
    await db.commit()

    return {"is_valid": is_valid}


@router.get("/{key_id}/balance")
async def get_balance(
    key_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from uuid import UUID
    stmt = select(ExchangeKey).where(ExchangeKey.id == UUID(key_id), ExchangeKey.user_id == user.id)
    result = await db.execute(stmt)
    key = result.scalar_one_or_none()
    if not key:
        raise HTTPException(404, "API 키를 찾을 수 없습니다.")

    client = UpbitClient(decrypt_key(key.access_key_enc), decrypt_key(key.secret_key_enc))
    try:
        balance = await client.get_balance()
        return balance
    except Exception as e:
        raise HTTPException(400, f"잔고 조회 실패: {str(e)}")
    finally:
        await client.close()
