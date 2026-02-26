"""
Seed script for community posts.
Run: python scripts/seed_posts.py   (from the backend directory)
"""
import asyncio
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from sqlalchemy import select, func
from db.database import AsyncSessionLocal
from db.models import User, Post


ADMIN_EMAIL = "admin@bitram.co.kr"
ADMIN_NICKNAME = "BITRAM 운영자"
# bcrypt hash of "admin1234!" — change after first login
ADMIN_PASSWORD_HASH = (
    "$2b$12$LJ3m4ys4Gz0mGKfSzQK0/.ZxVHKkQxQ3GxfYxFHrS5YB0OXxujxSi"
)

SEED_POSTS = [
    # ── free (자유게시판) ──────────────────────────────────────────────────
    {
        "category": "free",
        "title": "BITRAM 커뮤니티에 오신 것을 환영합니다!",
        "content": (
            "안녕하세요, BITRAM 커뮤니티에 오신 것을 진심으로 환영합니다!\n\n"
            "BITRAM은 암호화폐 자동매매를 누구나 쉽게 시작할 수 있도록 만든 플랫폼입니다. "
            "코딩 없이 드래그 앤 드롭으로 전략을 만들고, 백테스트로 검증한 뒤 실전 매매까지 "
            "한 번에 진행할 수 있습니다. 이 커뮤니티에서 전략을 공유하고, 서로의 경험에서 "
            "배우며, 함께 성장하는 트레이딩 문화를 만들어 갑시다. "
            "궁금한 점은 언제든지 질문 게시판에 남겨주세요!"
        ),
        "is_pinned": True,
    },
    {
        "category": "free",
        "title": "커뮤니티 이용 가이드 및 규칙 안내",
        "content": (
            "BITRAM 커뮤니티를 즐겁고 유익하게 이용하기 위한 기본 규칙을 안내드립니다.\n\n"
            "1. 서로 존중하는 언어를 사용해 주세요. 비방, 욕설, 혐오 표현은 삭제됩니다.\n"
            "2. 투자 추천이나 보장 수익률 홍보는 금지됩니다. 모든 투자 판단은 본인 책임입니다.\n"
            "3. 전략 공유 시 백테스트 기간과 조건을 명시하면 더 유익한 토론이 됩니다.\n"
            "4. 스팸, 외부 링크 남용, 도배글은 경고 없이 삭제됩니다.\n"
            "5. 수익 인증 게시판에서는 BITRAM 연동 수익만 인증됩니다.\n\n"
            "즐거운 커뮤니티 생활 되세요!"
        ),
        "is_pinned": True,
    },
    # ── strategy (전략) ──────────────────────────────────────────────────
    {
        "category": "strategy",
        "title": "노코드 전략 빌더 완벽 가이드 - 처음 시작하는 분들을 위해",
        "content": (
            "BITRAM의 노코드 전략 빌더를 처음 사용하시는 분들을 위한 가이드입니다.\n\n"
            "1단계: 매매 페어 선택 - KRW-BTC, KRW-ETH 등 원하는 코인을 선택합니다.\n"
            "2단계: 타임프레임 설정 - 1분봉부터 일봉까지 본인 스타일에 맞게 설정합니다.\n"
            "3단계: 진입 조건 설정 - RSI, MACD, 볼린저밴드 등 기술적 지표를 조합합니다.\n"
            "4단계: 청산 조건 설정 - 목표 수익률, 손절 라인, 트레일링 스탑을 지정합니다.\n"
            "5단계: 백테스트 실행 - 과거 데이터로 전략 성능을 검증합니다.\n\n"
            "가장 중요한 것은 백테스트 결과를 과신하지 않는 것입니다. "
            "소액으로 시작해서 점진적으로 투자금을 늘리세요."
        ),
    },
    {
        "category": "strategy",
        "title": "RSI 기반 역추세 전략 예시 - 초보자 추천 설정",
        "content": (
            "RSI(상대강도지수)를 활용한 간단하면서도 효과적인 역추세 전략을 소개합니다.\n\n"
            "설정값:\n"
            "- 페어: KRW-BTC\n"
            "- 타임프레임: 4시간봉\n"
            "- 진입 조건: RSI(14) < 30 (과매도 구간 진입)\n"
            "- 청산 조건: RSI(14) > 65 또는 손절 -3%\n"
            "- 투자 비중: 총 자산의 10%씩 분할 매수\n\n"
            "이 전략의 핵심은 공포에 매수하고 탐욕에 매도하는 것입니다. "
            "단, 강한 하락 추세에서는 RSI가 오랫동안 과매도 구간에 머물 수 있으므로 "
            "반드시 손절 라인을 설정하고, MACD 골든크로스를 추가 조건으로 넣으면 "
            "승률을 높일 수 있습니다."
        ),
    },
    # ── question (질문) ──────────────────────────────────────────────────
    {
        "category": "question",
        "title": "자주 묻는 질문(FAQ) 모음 - 시작 전 꼭 읽어주세요",
        "content": (
            "BITRAM을 처음 사용하시면서 자주 하시는 질문들을 모았습니다.\n\n"
            "Q: API 키는 어디서 발급받나요?\n"
            "A: 업비트 > 마이페이지 > Open API 관리에서 발급 가능합니다. "
            "IP 주소 제한을 꼭 설정해 주세요.\n\n"
            "Q: 백테스트와 실제 수익률이 다를 수 있나요?\n"
            "A: 네, 슬리피지와 수수료, 시장 유동성 차이로 실매매 결과는 다를 수 있습니다.\n\n"
            "Q: 무료 플랜으로 어디까지 이용 가능한가요?\n"
            "A: 전략 1개 생성, 백테스트 무제한, 모의매매를 이용하실 수 있습니다.\n\n"
            "Q: 봇이 갑자기 멈추면 어떻게 하나요?\n"
            "A: 대시보드에서 봇 상태를 확인하고, 에러 메시지를 참고하여 "
            "API 키 유효성을 먼저 점검해 주세요."
        ),
        "is_pinned": True,
    },
    {
        "category": "question",
        "title": "타임프레임은 어떤 걸 선택하면 좋을까요?",
        "content": (
            "트레이딩 타임프레임 선택은 본인의 투자 스타일에 따라 달라집니다.\n\n"
            "단타(스캘핑): 1분~15분봉을 사용합니다. 빈번한 매매로 작은 수익을 누적하지만 "
            "수수료 부담이 크고 정신적으로 힘들 수 있습니다.\n\n"
            "데이트레이딩: 1시간~4시간봉이 적합합니다. 하루에 1~3회 매매하며, "
            "초보자에게 가장 추천드리는 구간입니다.\n\n"
            "스윙트레이딩: 일봉~주봉 기준으로 며칠에서 몇 주간 포지션을 유지합니다. "
            "직장인처럼 매매에 많은 시간을 쓸 수 없는 분들에게 적합합니다.\n\n"
            "BITRAM 자동매매에서는 4시간봉이 가장 안정적인 성과를 보여주는 경향이 있습니다."
        ),
    },
    # ── profit (수익) ────────────────────────────────────────────────────
    {
        "category": "profit",
        "title": "백테스트 수익률 분석 가이드 - 숫자 너머의 진실 읽기",
        "content": (
            "백테스트 결과를 올바르게 해석하는 방법을 안내합니다.\n\n"
            "1. 총 수익률보다 샤프 비율을 보세요. 리스크 대비 수익이 진짜 성과입니다.\n"
            "2. 최대 낙폭(MDD)을 확인하세요. MDD가 -30%라면 실전에서 그 하락을 "
            "견딜 수 있는지 스스로에게 물어보세요.\n"
            "3. 승률과 손익비를 함께 봐야 합니다. 승률 80%여도 평균 손실이 평균 이익의 "
            "5배라면 결국 손해입니다.\n"
            "4. 거래 횟수가 최소 50회 이상인 결과만 신뢰하세요.\n"
            "5. 과최적화를 경계하세요. 특정 기간에만 잘 맞는 전략은 미래에 통하지 않습니다.\n\n"
            "항상 백테스트 기간의 50% 구간을 별도 검증(OOS) 구간으로 남겨두는 습관을 들이세요."
        ),
    },
    {
        "category": "profit",
        "title": "수익 인증 게시판 이용 안내",
        "content": (
            "BITRAM의 수익 인증 게시판은 투명하고 신뢰할 수 있는 수익 공유를 지향합니다.\n\n"
            "인증 방법:\n"
            "- BITRAM 봇 연동 수익: 자동으로 검증 배지가 부여됩니다.\n"
            "- 수동 인증: 거래소 스크린샷과 함께 기간, 투자금, 전략 개요를 작성해 주세요.\n\n"
            "주의사항:\n"
            "- 수익률 조작이 적발되면 영구 정지됩니다.\n"
            "- 과거 특정 기간의 수익만 강조하는 것은 오해를 줄 수 있으니 "
            "전체 운용 기간과 MDD도 함께 공유해 주세요.\n"
            "- 수익 인증은 투자 추천이 아닙니다. 참고 자료로만 활용해 주세요.\n\n"
            "서로의 성과를 축하하고, 실패에서도 배울 수 있는 문화를 만들어 갑시다."
        ),
    },
    # ── chart (차트분석) ──────────────────────────────────────────────────
    {
        "category": "chart",
        "title": "차트 분석 기초 - 꼭 알아야 할 5가지 기술적 지표",
        "content": (
            "암호화폐 트레이딩에서 가장 많이 활용되는 기술적 지표 5가지를 정리했습니다.\n\n"
            "1. RSI(상대강도지수): 0~100 사이 값으로 과매수(70 이상)/과매도(30 이하)를 판단합니다.\n"
            "2. MACD: 단기/장기 이동평균선의 차이로 추세 전환을 포착합니다. "
            "골든크로스(매수 신호)와 데드크로스(매도 신호)가 핵심입니다.\n"
            "3. 볼린저밴드: 가격의 변동성을 시각화합니다. 밴드가 좁아지면 큰 움직임이 임박했다는 신호입니다.\n"
            "4. 이동평균선(MA): 20일, 50일, 200일선의 배열로 중장기 추세를 확인합니다.\n"
            "5. 거래량: 가격 움직임의 신뢰도를 검증합니다. 거래량이 수반되지 않은 상승은 "
            "허상일 가능성이 높습니다.\n\n"
            "BITRAM 전략 빌더에서 이 지표들을 자유롭게 조합해 보세요."
        ),
    },
    {
        "category": "chart",
        "title": "지지선과 저항선 제대로 그리는 법",
        "content": (
            "차트 분석의 가장 기본이 되는 지지선과 저항선 설정법을 알아봅시다.\n\n"
            "지지선은 가격이 하락하다가 반등하는 가격대이고, 저항선은 상승하다가 "
            "되돌아오는 가격대입니다. 이 구간에서 매수/매도 주문이 집중되어 있기 때문입니다.\n\n"
            "설정 방법:\n"
            "- 최소 2~3번 이상 반응한 가격대를 기준으로 수평선을 긋습니다.\n"
            "- 정확한 가격보다 '가격대(Zone)'로 인식하는 것이 현실적입니다.\n"
            "- 타임프레임이 클수록 강력한 지지/저항입니다. 일봉 > 4시간봉 > 1시간봉\n"
            "- 지지선이 뚫리면 저항선이 되고, 저항선이 뚫리면 지지선이 됩니다.\n\n"
            "자동매매에서도 지지/저항 구간에서 분할 매수/매도를 설정하면 효과적입니다."
        ),
    },
    # ── news (뉴스) ──────────────────────────────────────────────────────
    {
        "category": "news",
        "title": "2026년 암호화폐 시장 전망 - 주요 이벤트와 트렌드",
        "content": (
            "2026년 암호화폐 시장에서 주목해야 할 핵심 이벤트와 트렌드를 정리했습니다.\n\n"
            "1. 비트코인 반감기 이후 사이클: 2024년 4월 반감기 이후 역사적으로 "
            "12~18개월 뒤에 상승장이 본격화되는 패턴이 있습니다.\n"
            "2. ETF 자금 유입 현황: 비트코인/이더리움 현물 ETF 승인 이후 "
            "기관 자금 유입이 지속적으로 증가하고 있습니다.\n"
            "3. 글로벌 규제 환경: 각국의 암호화폐 규제가 명확해지면서 "
            "기관 투자가 활성화되는 추세입니다.\n"
            "4. AI와 블록체인의 융합: AI 에이전트, 탈중앙 AI 컴퓨팅 등 "
            "새로운 섹터가 부상하고 있습니다.\n\n"
            "시장 전망은 참고 자료일 뿐, 항상 리스크 관리를 최우선으로 하세요."
        ),
    },
    # ── humor (유머) ─────────────────────────────────────────────────────
    {
        "category": "humor",
        "title": "트레이더라면 공감하는 순간들",
        "content": (
            "코인 트레이딩을 하다 보면 누구나 겪는 공감 포인트들을 모아봤습니다.\n\n"
            "- 매수 직후 가격이 떨어지는 건 만유인력의 법칙\n"
            "- 손절하면 바로 반등하는 건 뉴턴의 제3법칙\n"
            "- '이번엔 다르다'는 시장에서 가장 비싼 말\n"
            "- 차트를 안 볼 때 수익이 더 잘 나는 미스터리\n"
            "- 분할 매수하겠다고 다짐했지만 풀매수하는 월요일 아침\n"
            "- 친구가 코인 추천해달라고 하면 갑자기 입이 무거워지는 현상\n"
            "- '장기투자'는 단타 실패 후 붙이는 이름\n\n"
            "웃으면서 읽으셨다면 이미 훌륭한 트레이더입니다. "
            "유머도 멘탈 관리의 일부니까요! 여러분의 트레이딩 짤도 공유해 주세요."
        ),
    },
]


async def seed():
    async with AsyncSessionLocal() as db:
        # 1. Find or create admin user
        result = await db.execute(
            select(User).where(User.email == ADMIN_EMAIL)
        )
        admin = result.scalar_one_or_none()

        if admin is None:
            admin = User(
                email=ADMIN_EMAIL,
                password_hash=ADMIN_PASSWORD_HASH,
                nickname=ADMIN_NICKNAME,
                role="admin",
                email_verified=True,
                is_active=True,
            )
            db.add(admin)
            await db.flush()
            print(f"  [created] admin user: {ADMIN_EMAIL}")
        else:
            print(f"  [exists] admin user: {ADMIN_EMAIL}")

        # 2. Check if admin already has posts — skip if so
        post_count_result = await db.execute(
            select(func.count()).select_from(Post).where(Post.user_id == admin.id)
        )
        existing_count = post_count_result.scalar()

        if existing_count > 0:
            print(f"  [skip] admin already has {existing_count} posts, skipping seed.")
            return

        # 3. Create seed posts
        for data in SEED_POSTS:
            post = Post(
                user_id=admin.id,
                category=data["category"],
                title=data["title"],
                content=data["content"],
                content_format="plain",
                is_pinned=data.get("is_pinned", False),
                view_count=0,
                like_count=0,
                comment_count=0,
            )
            db.add(post)
            print(f"  [created] [{data['category']}] {data['title']}")

        await db.commit()
        print(f"\nSeed complete! Created {len(SEED_POSTS)} posts.")


if __name__ == "__main__":
    asyncio.run(seed())
