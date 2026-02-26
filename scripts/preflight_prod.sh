#!/bin/bash
# BITRAM - Production preflight checks
set -u

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND_ENV="$ROOT_DIR/backend/.env.production"
FRONTEND_ENV="$ROOT_DIR/frontend/.env.production"
BACKEND_PYTHON="$ROOT_DIR/backend/venv/bin/python"
if [ ! -x "$BACKEND_PYTHON" ]; then
  BACKEND_PYTHON="python3"
fi

FAIL_COUNT=0
WARN_COUNT=0
HAS_DOCKER=0

pass() {
  echo "[PASS] $1"
}

warn() {
  echo "[WARN] $1"
  WARN_COUNT=$((WARN_COUNT + 1))
}

fail() {
  echo "[FAIL] $1"
  FAIL_COUNT=$((FAIL_COUNT + 1))
}

require_cmd() {
  if command -v "$1" >/dev/null 2>&1; then
    pass "Command available: $1"
    if [ "$1" = "docker" ]; then
      HAS_DOCKER=1
    fi
  else
    fail "Missing required command: $1"
  fi
}

get_env_value() {
  local file="$1"
  local key="$2"
  local line
  line="$(grep -E "^${key}=" "$file" | tail -n 1 || true)"
  if [ -z "$line" ]; then
    echo ""
    return
  fi
  echo "${line#*=}" | sed -E 's/^"(.*)"$/\1/' | sed -E "s/^'(.*)'$/\1/"
}

check_non_empty() {
  local file="$1"
  local key="$2"
  local value
  value="$(get_env_value "$file" "$key")"
  if [ -n "$value" ]; then
    pass "$key is set"
  else
    fail "$key is not set in $(basename "$file")"
  fi
}

echo "BITRAM production preflight"
echo "=========================================="

require_cmd docker
require_cmd python3
require_cmd npm

if [ ! -f "$BACKEND_ENV" ]; then
  fail "Missing $BACKEND_ENV"
else
  pass "Found $BACKEND_ENV"
fi

if [ ! -f "$FRONTEND_ENV" ]; then
  warn "Missing $FRONTEND_ENV (optional if env is injected by CI/CD)"
else
  pass "Found $FRONTEND_ENV"
fi

if [ -f "$BACKEND_ENV" ]; then
  check_non_empty "$BACKEND_ENV" "DATABASE_URL"
  check_non_empty "$BACKEND_ENV" "DATABASE_URL_SYNC"
  check_non_empty "$BACKEND_ENV" "REDIS_URL"
  check_non_empty "$BACKEND_ENV" "JWT_SECRET_KEY"
  check_non_empty "$BACKEND_ENV" "ENCRYPTION_KEY"
  check_non_empty "$BACKEND_ENV" "CORS_ORIGINS"
  check_non_empty "$BACKEND_ENV" "FRONTEND_URL"
  check_non_empty "$BACKEND_ENV" "APP_ENV"

  APP_ENV_VALUE="$(get_env_value "$BACKEND_ENV" "APP_ENV")"
  CORS_ORIGINS_VALUE="$(get_env_value "$BACKEND_ENV" "CORS_ORIGINS")"
  FRONTEND_URL_VALUE="$(get_env_value "$BACKEND_ENV" "FRONTEND_URL")"
  JWT_SECRET_VALUE="$(get_env_value "$BACKEND_ENV" "JWT_SECRET_KEY")"
  ENCRYPTION_KEY_VALUE="$(get_env_value "$BACKEND_ENV" "ENCRYPTION_KEY")"
  PAPER_TRADING_VALUE="$(get_env_value "$BACKEND_ENV" "PAPER_TRADING")"

  if [ "$APP_ENV_VALUE" = "production" ]; then
    pass "APP_ENV=production"
  else
    fail "APP_ENV must be production"
  fi

  if echo "$CORS_ORIGINS_VALUE" | grep -q '\*'; then
    fail "CORS_ORIGINS must not contain wildcard (*)"
  else
    pass "CORS_ORIGINS wildcard check"
  fi

  if echo "$FRONTEND_URL_VALUE" | grep -q '^https://'; then
    pass "FRONTEND_URL uses HTTPS"
  else
    warn "FRONTEND_URL should use HTTPS in production"
  fi

  if [ "${#JWT_SECRET_VALUE}" -ge 32 ]; then
    pass "JWT_SECRET_KEY length is acceptable"
  else
    fail "JWT_SECRET_KEY should be at least 32 chars"
  fi

  if [ "${#ENCRYPTION_KEY_VALUE}" -ge 32 ]; then
    pass "ENCRYPTION_KEY length is acceptable"
  else
    fail "ENCRYPTION_KEY should be at least 32 chars"
  fi

  if [ "$PAPER_TRADING_VALUE" = "False" ] || [ "$PAPER_TRADING_VALUE" = "false" ]; then
    pass "PAPER_TRADING is disabled for production"
  else
    warn "PAPER_TRADING is enabled"
  fi
fi

echo ""
echo "Validating compose files..."
if [ "$HAS_DOCKER" -eq 1 ]; then
  if docker compose -f "$ROOT_DIR/docker-compose.yml" config >/dev/null 2>&1; then
    pass "docker-compose.yml is valid"
  else
    fail "docker-compose.yml is invalid"
  fi

  if docker compose -f "$ROOT_DIR/docker-compose.prod.yml" config >/dev/null 2>&1; then
    pass "docker-compose.prod.yml is valid"
  else
    fail "docker-compose.prod.yml is invalid"
  fi
else
  warn "Docker not available, skipping compose validation"
fi

echo ""
echo "Running backend syntax checks..."
if "$BACKEND_PYTHON" -m compileall "$ROOT_DIR/backend/main.py" "$ROOT_DIR/backend/api" >/dev/null 2>&1; then
  pass "Backend compile check"
else
  fail "Backend compile check failed"
fi

echo ""
echo "Running backend unit tests..."
if (cd "$ROOT_DIR/backend" && "$BACKEND_PYTHON" -m unittest discover -s tests -p "test_*.py" >/dev/null 2>&1); then
  pass "Backend unit tests"
else
  fail "Backend unit tests failed"
fi

echo ""
echo "Running frontend type check..."
if (cd "$ROOT_DIR/frontend" && npx tsc --noEmit >/dev/null 2>&1); then
  pass "Frontend type check"
else
  fail "Frontend type check failed"
fi

echo "=========================================="
echo "Preflight summary: fail=$FAIL_COUNT warn=$WARN_COUNT"

if [ "$FAIL_COUNT" -gt 0 ]; then
  exit 1
fi

exit 0
