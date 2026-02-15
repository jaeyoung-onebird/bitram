"""
Seed script for sub-communities.
Run: python scripts/seed_communities.py
"""
import asyncio
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from sqlalchemy import select
from db.database import AsyncSessionLocal
from db.models import SubCommunity


SEED_COMMUNITIES = [
    # Coin boards
    {"slug": "btc", "name": "비트코인 (BTC)", "description": "비트코인 관련 분석, 뉴스, 전략을 공유하는 게시판입니다.", "coin_pair": "KRW-BTC", "icon_url": None},
    {"slug": "eth", "name": "이더리움 (ETH)", "description": "이더리움 생태계, DeFi, 가격 분석을 논의합니다.", "coin_pair": "KRW-ETH", "icon_url": None},
    {"slug": "xrp", "name": "리플 (XRP)", "description": "XRP 관련 소식과 전략을 나눕니다.", "coin_pair": "KRW-XRP", "icon_url": None},
    {"slug": "sol", "name": "솔라나 (SOL)", "description": "솔라나 생태계와 트레이딩 전략을 공유합니다.", "coin_pair": "KRW-SOL", "icon_url": None},
    {"slug": "doge", "name": "도지코인 (DOGE)", "description": "도지코인 커뮤니티입니다.", "coin_pair": "KRW-DOGE", "icon_url": None},
    {"slug": "ada", "name": "에이다 (ADA)", "description": "카르다노/에이다 관련 정보와 분석을 공유합니다.", "coin_pair": "KRW-ADA", "icon_url": None},
    {"slug": "avax", "name": "아발란체 (AVAX)", "description": "아발란체 네트워크와 AVAX 토큰을 논의합니다.", "coin_pair": "KRW-AVAX", "icon_url": None},
    {"slug": "matic", "name": "폴리곤 (MATIC)", "description": "폴리곤 생태계와 MATIC 가격 분석을 공유합니다.", "coin_pair": "KRW-MATIC", "icon_url": None},
    {"slug": "dot", "name": "폴카닷 (DOT)", "description": "폴카닷 파라체인과 DOT 관련 소식을 나눕니다.", "coin_pair": "KRW-DOT", "icon_url": None},
    {"slug": "link", "name": "체인링크 (LINK)", "description": "체인링크 오라클과 LINK 토큰을 논의합니다.", "coin_pair": "KRW-LINK", "icon_url": None},
    # Topic boards
    {"slug": "free-talk", "name": "자유 토론", "description": "자유롭게 대화하는 공간입니다. 암호화폐, 투자, 일상 등 모든 주제를 환영합니다.", "coin_pair": None, "icon_url": None},
    {"slug": "strategy-sharing", "name": "전략 공유", "description": "자동매매 전략을 공유하고 피드백을 주고받는 게시판입니다.", "coin_pair": None, "icon_url": None},
    {"slug": "qna", "name": "질문/답변", "description": "BITRAM 사용법, 전략 설정, 매매 관련 질문을 올리는 게시판입니다.", "coin_pair": None, "icon_url": None},
]


async def seed():
    async with AsyncSessionLocal() as db:
        for data in SEED_COMMUNITIES:
            existing = (await db.execute(
                select(SubCommunity).where(SubCommunity.slug == data["slug"])
            )).scalar_one_or_none()

            if existing:
                print(f"  [skip] {data['slug']} already exists")
                continue

            community = SubCommunity(**data)
            db.add(community)
            print(f"  [created] {data['slug']} - {data['name']}")

        await db.commit()
        print("\nSeed complete!")


if __name__ == "__main__":
    asyncio.run(seed())
