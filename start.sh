#!/bin/sh

echo "[start] running migration..."
if node backend/dist/db/migrate.js; then
  echo "[start] migration complete"
else
  echo "[start] WARNING: migration failed, starting server anyway (degraded)"
fi

echo "[start] starting server..."
exec node backend/dist/server.js
