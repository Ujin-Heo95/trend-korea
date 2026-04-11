# ── Stage 1: Build ──────────────────────────────────────
FROM node:20-slim AS builder

# BUILD_FRONTEND=false → 프론트엔드 빌드 스킵 (API 전용 모드, Fly.io)
ARG BUILD_FRONTEND=true

WORKDIR /app

# Copy workspace root + both workspace package.jsons for dependency caching
COPY package.json package-lock.json .npmrc ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/

RUN npm ci

# Copy all source
COPY backend/ backend/
COPY frontend/ frontend/

# Build frontend (tsc + vite build → frontend/dist/) — 조건부
RUN if [ "$BUILD_FRONTEND" = "true" ]; then npm run build --workspace=frontend; fi

# Build backend (tsc + copy migrations → backend/dist/)
RUN npm run build --workspace=backend

# ── Stage 2: Production ────────────────────────────────
FROM node:20-slim

ARG BUILD_FRONTEND=true

WORKDIR /app

COPY package.json package-lock.json .npmrc ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/

RUN npm ci --omit=dev

# Copy built artifacts
COPY --from=builder /app/backend/dist backend/dist
RUN if [ "$BUILD_FRONTEND" = "true" ]; then echo "frontend included"; fi
COPY --from=builder /app/frontend/ frontend_tmp/
RUN if [ "$BUILD_FRONTEND" = "true" ] && [ -d frontend_tmp/dist ]; then \
      mv frontend_tmp/dist frontend/dist; \
    fi && rm -rf frontend_tmp

COPY start.sh .
RUN chmod +x start.sh

ENV NODE_ENV=production

CMD ["./start.sh"]
