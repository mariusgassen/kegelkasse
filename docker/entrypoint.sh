#!/bin/sh
set -e
export PYTHONPATH=/app/app
echo "[Kegelkasse] Running database migrations..."
cd /app && alembic upgrade head
echo "[Kegelkasse] Seeding initial data..."
python -m app.scripts.create_admin
echo "[Kegelkasse] Starting server..."
exec uvicorn main:app --host 0.0.0.0 --port 8000
