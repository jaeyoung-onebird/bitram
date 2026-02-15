"""
Redis caching utility for BITRAM.
Uses the redis.asyncio module (already in requirements.txt as redis==5.1.0).
"""
import json
import logging
from typing import Any

import redis.asyncio as aioredis

from config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

_pool: aioredis.ConnectionPool | None = None


def _get_pool() -> aioredis.ConnectionPool:
    global _pool
    if _pool is None:
        _pool = aioredis.ConnectionPool.from_url(
            settings.REDIS_URL,
            max_connections=20,
            decode_responses=True,
        )
    return _pool


async def get_redis() -> aioredis.Redis:
    return aioredis.Redis(connection_pool=_get_pool())


async def cache_get(key: str) -> Any | None:
    try:
        r = await get_redis()
        val = await r.get(key)
        if val is not None:
            return json.loads(val)
        return None
    except Exception as e:
        logger.warning(f"Redis cache_get error: {e}")
        return None


async def cache_set(key: str, value: Any, ttl: int = 300) -> None:
    try:
        r = await get_redis()
        await r.setex(key, ttl, json.dumps(value, default=str))
    except Exception as e:
        logger.warning(f"Redis cache_set error: {e}")


async def cache_delete(key: str) -> None:
    try:
        r = await get_redis()
        await r.delete(key)
    except Exception as e:
        logger.warning(f"Redis cache_delete error: {e}")


async def cache_delete_pattern(pattern: str) -> None:
    try:
        r = await get_redis()
        async for key in r.scan_iter(match=pattern):
            await r.delete(key)
    except Exception as e:
        logger.warning(f"Redis cache_delete_pattern error: {e}")
