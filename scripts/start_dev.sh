#!/bin/bash
# BITRAM - Development startup script
set -e

ONEBIRD_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "🐦 BITRAM - Development Mode"
echo "=========================================="

# 1. Start Docker services (PostgreSQL + Redis)
echo "Starting PostgreSQL + Redis..."
cd "$ONEBIRD_DIR"
docker compose up -d postgres redis
echo "Waiting for services to be ready..."
sleep 5

# 2. Initialize database
echo "Initializing database..."
cd "$ONEBIRD_DIR/backend"
if [ ! -d "venv" ]; then
    python3 -m venv venv
fi
source venv/bin/activate
pip install -q -r requirements.txt

python -m db.init_db

# 3. Start backend
echo "Starting backend API server..."
uvicorn main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!
echo "Backend PID: $BACKEND_PID"

# 4. Start frontend
echo "Starting frontend..."
cd "$ONEBIRD_DIR/frontend"
if [ ! -d "node_modules" ]; then
    npm install
fi
npm run dev &
FRONTEND_PID=$!
echo "Frontend PID: $FRONTEND_PID"

echo ""
echo "=========================================="
echo "🐦 BITRAM is running!"
echo "  Frontend: http://localhost:3000"
echo "  Backend:  http://localhost:8000"
echo "  API Docs: http://localhost:8000/docs"
echo "=========================================="

# Wait for both processes
wait $BACKEND_PID $FRONTEND_PID
