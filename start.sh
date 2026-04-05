#!/bin/sh
set -e

echo "[start] node version: $(node --version)"
echo "[start] pwd: $(pwd)"
echo "[start] checking files..."
ls -la backend/dist/db/migrate.js backend/dist/server.js frontend/dist/index.html

echo "[start] running migration..."
node backend/dist/db/migrate.js 2>&1 || { echo "[start] migration FAILED with exit code $?"; exit 1; }

echo "[start] starting server..."
exec node backend/dist/server.js
