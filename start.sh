#!/bin/bash
# Start BITRAM services

# Kill existing
pkill -f "uvicorn main:app" 2>/dev/null
pkill -f "server.js.*standalone" 2>/dev/null
sleep 2

# Start backend
cd /home/ubuntu/onebird/backend
nohup /home/ubuntu/onebird/backend/venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000 > /tmp/backend.log 2>&1 &
echo "Backend started: PID $!"

sleep 5

# Start frontend
cd /home/ubuntu/onebird/frontend/.next/standalone
PORT=3000 HOSTNAME=0.0.0.0 nohup node --max-old-space-size=256 server.js > /tmp/frontend.log 2>&1 &
echo "Frontend started: PID $!"

sleep 3
echo "---"
curl -s -o /dev/null -w "Backend: %{http_code}\n" http://localhost:8000/health
curl -s -o /dev/null -w "Frontend: %{http_code}\n" http://localhost:3000/
