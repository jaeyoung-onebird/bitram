#!/bin/bash
# BITRAM 프론트엔드 빠른 배포 스크립트
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SSH_KEY="/Users/jaeyoung_kim/Downloads/LightsailDefaultKey-ap-northeast-2.pem"
SERVER="ubuntu@3.36.140.242"
STANDALONE="$ROOT/frontend/.next/standalone/bitram/bitram/frontend"

echo "📦 빌드 중..."
cd "$ROOT/frontend"
npm run build

echo "📦 패키징..."
cd "$ROOT/frontend/.next"
tar czf /tmp/next-build-complete.tar.gz \
  BUILD_ID \
  app-path-routes-manifest.json \
  build-manifest.json \
  prerender-manifest.json \
  routes-manifest.json \
  server/ \
  static/

echo "📤 업로드..."
scp -i "$SSH_KEY" -o StrictHostKeyChecking=no \
  /tmp/next-build-complete.tar.gz \
  "$STANDALONE/server.js" \
  "$SERVER:/tmp/"

echo "🚀 서버 배포 & 재시작..."
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "$SERVER" '
  STANDALONE=~/onebird/frontend/.next/standalone
  cp /tmp/server.js $STANDALONE/server.js
  cd $STANDALONE/.next && rm -rf static server && tar xzf /tmp/next-build-complete.tar.gz 2>/dev/null
  sudo rsync -a --delete $STANDALONE/.next/static/ /var/www/bitram-next-static/
  sudo systemctl restart bitram-frontend
  sleep 3
  curl -sf http://127.0.0.1:3000/ -o /dev/null && echo "✅ 배포 완료 (BUILD_ID: $(cat BUILD_ID))" || echo "❌ 헬스체크 실패"
'
