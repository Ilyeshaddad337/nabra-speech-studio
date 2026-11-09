#!/usr/bin/env bash
# Dev runner: FastAPI on :8000, Vite on :5173 (proxying /api to the API).
set -euo pipefail
cd "$(dirname "$0")"

[ -x backend/.venv/bin/uvicorn ] || { echo "Run ./setup.sh first."; exit 1; }

cleanup() { kill 0 2>/dev/null || true; }
trap cleanup EXIT INT TERM

( cd backend && .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port "${API_PORT:-8000}" --reload ) &
( cd frontend && npm run dev -- --port "${UI_PORT:-5173}" ) &

wait
