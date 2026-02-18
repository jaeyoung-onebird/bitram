#!/bin/bash
# BITRAM - Production Deploy Script
# 로컬 빌드 → 서버 배포 → 서비스 재시작 자동화
set -e

ONEBIRD_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SERVER="${BITRAM_SERVER:-}"
SSH_KEY="${BITRAM_SSH_KEY:-}"
SSH="ssh -i $SSH_KEY $SERVER"
RSYNC="rsync -avz -e 'ssh -i $SSH_KEY'"

if [ -z "$SERVER" ]; then
  echo "❌ BITRAM_SERVER 환경변수가 필요합니다. 예: ubuntu@1.2.3.4"
  exit 1
fi

if [ -z "$SSH_KEY" ]; then
  echo "❌ BITRAM_SSH_KEY 환경변수가 필요합니다. 예: \$HOME/.ssh/bitram.pem"
  exit 1
fi

if [ ! -f "$SSH_KEY" ]; then
  echo "❌ SSH 키 파일을 찾을 수 없습니다: $SSH_KEY"
  exit 1
fi

echo "🚀 BITRAM 프로덕션 배포 시작"
echo "=========================================="

echo ""
echo "🧪 [0/6] 사전 점검 실행..."
"$ONEBIRD_DIR/scripts/preflight_prod.sh"
echo "✅ 사전 점검 통과"

# 1. 프론트엔드 프로덕션 빌드 (NEXT_PUBLIC_ 변수 비우기)
echo ""
echo "📦 [1/6] 프론트엔드 프로덕션 빌드..."
cd "$ONEBIRD_DIR/frontend"
NEXT_PUBLIC_API_URL= NEXT_PUBLIC_WS_URL= npm run build
echo "✅ 빌드 완료"

# 2. 프론트엔드 standalone 배포
echo ""
echo "📤 [2/6] 프론트엔드 서버 배포..."
# standalone (server.js + node_modules)
rsync -avz --delete \
  -e "ssh -i $SSH_KEY" \
  "$ONEBIRD_DIR/frontend/.next/standalone/bitram/frontend/" \
  "$SERVER:~/onebird/frontend/.next/standalone/"

# static 파일 → standalone 내부
rsync -avz --delete \
  -e "ssh -i $SSH_KEY" \
  "$ONEBIRD_DIR/frontend/.next/static/" \
  "$SERVER:~/onebird/frontend/.next/standalone/.next/static/"

# static 파일 → nginx 직접 서빙 경로
rsync -avz --delete \
  -e "ssh -i $SSH_KEY" \
  "$ONEBIRD_DIR/frontend/.next/static/" \
  "$SERVER:/var/www/bitram-next-static/"

echo "✅ 프론트엔드 배포 완료"

# 3. 백엔드 배포
echo ""
echo "📤 [3/6] 백엔드 서버 배포..."
rsync -avz --delete \
  --exclude='venv' \
  --exclude='__pycache__' \
  --exclude='.env' \
  --exclude='*.pyc' \
  -e "ssh -i $SSH_KEY" \
  "$ONEBIRD_DIR/backend/" \
  "$SERVER:~/onebird/backend/"
echo "✅ 백엔드 배포 완료"

# 4. 서비스 재시작
echo ""
echo "🔄 [4/6] 서비스 재시작..."
$SSH 'sudo systemctl restart bitram-backend bitram-frontend bitram-celery'
echo "✅ 서비스 재시작 완료"

# 5. 상태 확인
echo ""
echo "🔍 [5/6] 서비스 상태 확인..."
sleep 3
$SSH 'sudo systemctl is-active bitram-backend bitram-frontend bitram-celery'

echo ""
echo "🩺 [6/6] 헬스체크..."
$SSH 'curl -fsS http://127.0.0.1:8000/health >/dev/null'
$SSH 'curl -fsS http://127.0.0.1:3000/ >/dev/null'
echo "✅ 헬스체크 통과"

echo ""
echo "=========================================="
echo "🎉 BITRAM 배포 완료!"
echo "  사이트: https://bitram.co.kr"
echo "=========================================="
