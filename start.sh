#!/bin/sh
set -e

echo "[start] running migration..."
node backend/dist/db/migrate.js

echo "[start] starting server..."
exec node backend/dist/server.js
