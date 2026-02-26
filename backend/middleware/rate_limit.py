"""
Redis-based sliding window rate limiter for FastAPI.
"""
import logging
import time
from functools import wraps

from fastapi import HTTPException, Request, status

from core.redis_cache import get_redis

logger = logging.getLogger(__name__)


def rate_limit(max_calls: int = 10, period: int = 60, key_func: str = "ip"):
    """
    Rate limiting decorator for FastAPI endpoints.

    Args:
        max_calls: Maximum number of calls allowed in the period.
        period: Time window in seconds.
        key_func: "ip" for IP-based limiting, "user" for user-based limiting.
    """
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            request: Request | None = kwargs.get("request")
            if request is None:
                for arg in args:
                    if isinstance(arg, Request):
                        request = arg
                        break

            if request is None:
                return await func(*args, **kwargs)

            # Build rate limit key
            if key_func == "user":
                user = kwargs.get("user") or kwargs.get("current_user")
                if user and hasattr(user, "id"):
                    identifier = str(user.id)
                else:
                    identifier = request.client.host if request.client else "unknown"
            else:
                identifier = request.client.host if request.client else "unknown"

            route = request.url.path
            redis_key = f"ratelimit:{route}:{identifier}"

            try:
                r = await get_redis()
                now = time.time()
                window_start = now - period

                pipe = r.pipeline()
                # Remove old entries
                pipe.zremrangebyscore(redis_key, 0, window_start)
                # Count current entries
                pipe.zcard(redis_key)
                # Add current request
                pipe.zadd(redis_key, {str(now): now})
                # Set expiry on the key
                pipe.expire(redis_key, period)
                results = await pipe.execute()

                current_count = results[1]

                if current_count >= max_calls:
                    raise HTTPException(
                        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                        detail="요청이 너무 많습니다. 잠시 후 다시 시도해주세요.",
                    )

            except HTTPException:
                raise
            except Exception as e:
                # If Redis is down, allow the request
                logger.warning(f"Rate limit check failed: {e}")

            return await func(*args, **kwargs)
        return wrapper
    return decorator
