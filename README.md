<p align="center">
  <img src="bitram/bitram2.jpg" alt="BITRAM" width="480" />
</p>

<h1 align="center">BITRAM</h1>

<p align="center">
  <strong>No-Code Crypto Trading Bot Builder & Community Platform</strong><br/>
  업비트(Upbit) 전용 자동매매 봇 빌더 + 트레이더 커뮤니티
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-15-black?logo=next.js" alt="Next.js" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react" alt="React" />
  <img src="https://img.shields.io/badge/FastAPI-0.115-009688?logo=fastapi" alt="FastAPI" />
  <img src="https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/TimescaleDB-latest-FDB515?logo=timescale" alt="TimescaleDB" />
  <img src="https://img.shields.io/badge/Redis-7-DC382D?logo=redis" alt="Redis" />
  <img src="https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker" alt="Docker" />
</p>

<p align="center">
  <a href="https://bitram.co.kr">bitram.co.kr</a>
</p>

---

## Overview

**BITRAM**은 코딩 없이 암호화폐 자동매매 전략을 만들고, 백테스트하고, 실전 운용할 수 있는 플랫폼입니다. 트레이더 커뮤니티, AI 전략 생성, 실시간 채팅, 게이미피케이션을 결합하여 리테일 트레이더를 위한 올인원 트레이딩 환경을 제공합니다.

### Key Features

| Feature | Description |
|---------|-------------|
| **Bot Builder** | 노코드 전략 빌더 — RSI, MACD, 볼린저밴드 등 기술 지표 조합으로 자동매매 봇 생성 |
| **Backtesting** | 과거 데이터 기반 전략 성과 시뮬레이션 (승률, MDD, 샤프비율, 수익곡선) |
| **AI Strategy** | Claude AI 기반 전략 자동 생성 및 최적화 |
| **Marketplace** | 커뮤니티 전략 탐색 · 복사 · 평가 |
| **Community** | 게시글, 댓글, 리액션, 시리즈(연재), 코인별 게시판 |
| **Live Chat** | 익명 실시간 채팅 + AI 봇 (비트램AI) 시세 브리핑 |
| **Gamification** | 포인트, 레벨, 퀘스트, 출석체크, 크리에이터 프로그램 |
| **Competitions** | 기간 한정 트레이딩 대회 및 랭킹 |

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│                    Nginx                         │
│              (Reverse Proxy)                     │
└────────┬────────────────────────┬───────────────┘
         │                        │
    ┌────▼────┐            ┌──────▼──────┐
    │ Next.js │            │   FastAPI   │
    │  :3000  │            │    :8000    │
    │ (SSR)   │◄──REST────►│  (API/WS)  │
    └─────────┘            └──────┬──────┘
                                  │
                    ┌─────────────┼─────────────┐
                    │             │             │
              ┌─────▼─────┐ ┌────▼────┐ ┌──────▼──────┐
              │ PostgreSQL │ │  Redis  │ │   Celery    │
              │ TimescaleDB│ │  Cache  │ │ Worker/Beat │
              │   :5432    │ │  :6379  │ │ (Scheduler) │
              └────────────┘ └─────────┘ └─────────────┘
```

---

## Tech Stack

### Frontend
- **Next.js 15** — App Router, Standalone output
- **React 19** — UI framework
- **Tailwind CSS 4** — Utility-first styling
- **Zustand** — State management
- **Recharts** — Data visualization
- **TypeScript** — Type safety

### Backend
- **FastAPI** — Async Python web framework
- **SQLAlchemy 2.0** — Async ORM
- **Alembic** — Database migrations
- **Celery + Redis** — Background task processing & scheduling
- **WebSockets** — Real-time communication

### Database
- **PostgreSQL 16 + TimescaleDB** — OHLCV 시계열 데이터 최적화
- **Redis 7** — 캐시, 메시지 브로커, 세션

### Integrations
- **Upbit API** — 시세 조회 & 자동매매 실행
- **Claude AI (Anthropic)** — 전략 생성, 트윗 번역, 채팅 AI
- **Telegram Bot** — 알림 & 명령
- **Twitter/X** — 자동 트윗 & 스레드 포스팅
- **Toss Payments** — 결제 처리
- **Google / Kakao OAuth** — 소셜 로그인
- **Sentry** — 에러 모니터링

---

## Project Structure

```
bitram/
├── frontend/                  # Next.js 15 App
│   ├── src/
│   │   ├── app/
│   │   │   ├── (auth)/       # 로그인, 회원가입, OAuth
│   │   │   ├── (dashboard)/  # 메인 앱 페이지
│   │   │   │   ├── dashboard/
│   │   │   │   ├── strategies/
│   │   │   │   ├── bots/
│   │   │   │   ├── community/
│   │   │   │   ├── marketplace/
│   │   │   │   ├── chat/
│   │   │   │   ├── competitions/
│   │   │   │   └── ...
│   │   │   └── page.tsx      # 랜딩 페이지
│   │   ├── components/       # 공유 UI 컴포넌트
│   │   ├── lib/              # API client, store, utils
│   │   └── types/            # TypeScript 타입 정의
│   └── package.json
│
├── backend/                   # FastAPI App
│   ├── api/                  # 40+ API 라우터
│   ├── core/                 # 비즈니스 로직 (전략, AI, 트위터)
│   ├── db/
│   │   ├── models.py         # 30+ SQLAlchemy 모델
│   │   └── session.py        # DB 세션 관리
│   ├── tasks/                # Celery 비동기 태스크
│   ├── telegram_module/      # 텔레그램 봇
│   ├── main.py               # FastAPI 엔트리포인트
│   ├── config.py             # 환경 설정
│   └── requirements.txt
│
├── scripts/                   # 배포 & 유틸 스크립트
├── docker-compose.yml         # 개발 환경
├── docker-compose.prod.yml    # 프로덕션 환경
└── ir-deck.html              # 투자자 IR 프레젠테이션
```

---

## Getting Started

### Prerequisites

- Docker & Docker Compose
- Node.js 20+ (프론트엔드 로컬 개발 시)
- Python 3.10+ (백엔드 로컬 개발 시)

### Quick Start (Docker)

```bash
# 1. Clone
git clone https://github.com/your-org/bitram.git
cd bitram/bitram

# 2. Environment 설정
cp backend/.env.example backend/.env
# .env 파일에 필수 값 입력 (DB, Redis, API keys)

# 3. 실행
docker compose up -d

# 4. DB 마이그레이션
docker compose exec backend alembic upgrade head
```

서비스 접속:
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8000
- **API Docs**: http://localhost:8000/docs

### Local Development

**Frontend:**
```bash
cd frontend
npm install
npm run dev          # http://localhost:3000
```

**Backend:**
```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

**Celery Worker & Beat:**
```bash
celery -A tasks.celery_app worker -l info -c 4
celery -A tasks.celery_app beat -l info
```

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL 연결 URL |
| `REDIS_URL` | Redis 연결 URL |
| `JWT_SECRET_KEY` | JWT 토큰 서명 키 |
| `ENCRYPTION_KEY` | API 키 암호화 키 |
| `ANTHROPIC_API_KEY` | Claude AI API 키 |
| `UPBIT_FEE_RATE` | 업비트 수수료율 (기본 0.0005) |
| `TELEGRAM_BOT_TOKEN` | 텔레그램 봇 토큰 |
| `TWITTER_API_KEY` | Twitter API 키 |
| `TWITTER_API_SECRET` | Twitter API 시크릿 |
| `GOOGLE_CLIENT_ID` | Google OAuth 클라이언트 ID |
| `KAKAO_CLIENT_ID` | Kakao OAuth 클라이언트 ID |
| `SMTP_HOST` / `SMTP_USER` | 이메일 발송 설정 |
| `SENTRY_DSN` | Sentry 에러 모니터링 |
| `TOSS_CLIENT_KEY` | Toss Payments 클라이언트 키 |

---

## API Overview

40개 이상의 REST API 엔드포인트를 제공합니다.

| Module | Endpoints | Description |
|--------|-----------|-------------|
| Auth | `/api/auth/*` | 회원가입, 로그인, OAuth, 이메일 인증 |
| Strategies | `/api/strategies/*` | 전략 CRUD, AI 생성 |
| Backtest | `/api/backtest/*` | 백테스트 실행 및 결과 |
| Bots | `/api/bots/*` | 봇 생성, 시작/정지, 상태 조회 |
| Trades | `/api/trades/*` | 거래 내역 |
| Community | `/api/posts/*`, `/api/communities/*` | 게시글, 댓글, 리액션 |
| Chat | `/api/chat/*` | 실시간 채팅 (WebSocket) |
| Marketplace | `/api/marketplace/*` | 전략 마켓플레이스 |
| Points | `/api/points/*`, `/api/quests/*` | 포인트, 레벨, 퀘스트 |
| Notifications | `/api/notifications/*` | 알림 관리 |

전체 API 문서: `/docs` (Swagger UI)

---

## Database Schema

30개 이상의 테이블로 구성됩니다.

**Core:**
`User` · `ExchangeKey` · `Strategy` · `Bot` · `Trade` · `OHLCV`

**Community:**
`Post` · `Comment` · `Like` · `Reaction` · `Bookmark` · `PostSeries` · `SubCommunity`

**Gamification:**
`UserPoints` · `PointLog` · `Attendance` · `QuestClaim` · `Badge`

**Social:**
`Follow` · `Block` · `Conversation` · `DirectMessage` · `Notification`

**Commerce:**
`Subscription` · `Payment` · `Referral` · `Competition` · `CompetitionEntry`

---

## Deployment

### Production (Docker Compose)

```bash
docker compose -f docker-compose.prod.yml up -d
```

### Manual Deploy (Standalone)

```bash
# Frontend 빌드 & 배포
cd frontend && npm run build
bash scripts/deploy_frontend_fast.sh

# Backend 서비스 재시작
sudo systemctl restart bitram-backend
sudo systemctl restart bitram-celery
```

---

## License

This project is proprietary software. All rights reserved.

© 2025-2026 BITRAM. Unauthorized copying, distribution, or modification is prohibited.
