# ── Stage 1: Build ──────────────────────────────────────
FROM node:20-slim AS builder

WORKDIR /app

# Copy workspace root + both workspace package.jsons for dependency caching
COPY package.json package-lock.json .npmrc ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/

RUN npm ci

# Copy all source
COPY backend/ backend/
COPY frontend/ frontend/

# Build frontend (tsc + vite build → frontend/dist/)
RUN npm run build --workspace=frontend

# Build backend (tsc + copy migrations → backend/dist/)
RUN npm run build --workspace=backend

# Verify build artifacts exist
RUN ls -la backend/dist/server.js frontend/dist/index.html

# ── Stage 2: Production ────────────────────────────────
FROM node:20-slim

WORKDIR /app

COPY package.json package-lock.json .npmrc ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/

RUN npm ci --omit=dev

# Copy built artifacts
COPY --from=builder /app/backend/dist backend/dist
COPY --from=builder /app/frontend/dist frontend/dist

ENV NODE_ENV=production

CMD ["sh", "-c", "echo '[docker] starting server...' && node backend/dist/db/migrate.js && echo '[docker] migration done, launching server' && node backend/dist/server.js 2>&1"]
