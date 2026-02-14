"""
Seed demo data (TEST USERS + POSTS) into the database.

This is meant for development/staging only. It does NOT hit public signup APIs,
and should not be used to spam real users.
"""

import asyncio
import os
import random
import string
from datetime import datetime, timezone

from sqlalchemy import select

from config import get_settings
from db.database import AsyncSessionLocal
from db.models import User, Post
from api.deps import hash_password


def _rand_suffix(n: int = 6) -> str:
    return "".join(random.choice(string.ascii_lowercase + string.digits) for _ in range(n))


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def main():
    settings = get_settings()
    if settings.APP_ENV != "development":
        raise SystemExit("Refusing to seed demo data unless APP_ENV=development.")

    n_users = int(os.getenv("SEED_USERS", "10"))
    posts_per_user = int(os.getenv("SEED_POSTS_PER_USER", "3"))

    # Fixed password for convenience in dev.
    password_plain = os.getenv("SEED_PASSWORD", "test1234!")
    password_h = hash_password(password_plain)

    categories = ["free", "question", "profit", "strategy"]
    titles = [
        "테스트 글입니다",
        "전략 공유(테스트)",
        "백테스트 결과(테스트)",
        "질문 있어요(테스트)",
    ]
    bodies = [
        "이 글은 개발/데모용 시드 데이터입니다.",
        "UI 테스트를 위해 자동 생성된 내용입니다.",
        "실거래/실수익과 무관합니다.",
    ]

    created_users = 0
    created_posts = 0

    async with AsyncSessionLocal() as db:
        for i in range(n_users):
            email = f"demo+{i+1:02d}-{_rand_suffix()}@example.com"
            nickname = f"demo{i+1:02d}"

            # Ensure uniqueness if rerun.
            exists = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
            if exists:
                continue

            user = User(
                email=email,
                password_hash=password_h,
                nickname=nickname,
                plan="free",
                is_active=True,
                created_at=_now(),
                updated_at=_now(),
            )
            db.add(user)
            await db.flush()  # populate user.id
            created_users += 1

            for _ in range(posts_per_user):
                post = Post(
                    user_id=user.id,
                    category=random.choice(categories),
                    title=random.choice(titles),
                    content=" ".join(random.sample(bodies, k=random.randint(1, len(bodies)))),
                    created_at=_now(),
                    updated_at=_now(),
                )
                db.add(post)
                created_posts += 1

        await db.commit()

    print(f"Seeded users={created_users}, posts={created_posts}")
    print(f"Demo password (dev only): {password_plain}")


if __name__ == "__main__":
    asyncio.run(main())

