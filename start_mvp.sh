#!/usr/bin/env bash
set -e

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=== [1/3] Installing Python backend dependencies ==="
cd "$ROOT_DIR/backend"
python3 -m pip install -r requirements.txt

echo "=== [2/3] Installing Frontend dependencies ==="
cd "$ROOT_DIR/frontend"
if [ ! -d "node_modules" ]; then
  npm install
fi

echo "=== [3/3] Starting Backend (127.0.0.1:8000) & Frontend (127.0.0.1:5173) ==="
cd "$ROOT_DIR/backend"
python3 -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload &
BACKEND_PID=$!

trap "kill $BACKEND_PID 2>/dev/null || true" EXIT

cd "$ROOT_DIR/frontend"
npm run dev
