# BITRAM Production Runbook

## 1) Prepare Environment Files
- Create `backend/.env.production`
- Optionally create `frontend/.env.production`

Required backend keys:
- `DATABASE_URL`
- `DATABASE_URL_SYNC`
- `REDIS_URL`
- `JWT_SECRET_KEY`
- `ENCRYPTION_KEY`
- `CORS_ORIGINS`
- `FRONTEND_URL`
- `APP_ENV=production`

Recommended:
- `PAPER_TRADING=false`

## 2) Run Preflight
```bash
./scripts/preflight_prod.sh
```

If it fails, fix all `[FAIL]` items first.

## 2.5) Apply DB Migrations
```bash
cd backend
python -m db.init_db
```
This runs `alembic upgrade head`.

## 3) Deploy with Script (systemd-based target)
```bash
export BITRAM_SERVER="ubuntu@YOUR_SERVER_IP"
export BITRAM_SSH_KEY="$HOME/.ssh/your-key.pem"
./scripts/deploy.sh
```

## 4) Docker Compose Production
Use `docker-compose.prod.yml` when running containerized production:
```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Notes:
- Backend/Frontend ports are bound to `127.0.0.1` (use reverse proxy like Nginx in front).
- DB/Redis are internal-only by default.
