# 배포 가이드

> 2026-04-11 현행. Fly.io 도쿄 (백엔드) + Cloudflare Pages (프론트엔드).

---

## 1. 서비스 구조

```
Fly.io (도쿄 nrt)
└── weeklit-backend — Fastify API + 스케줄러 (shared-cpu-1x, 512MB)

Cloudflare Pages
└── weeklit-net — React SPA (frontend/dist)

Supabase Pro (서울)
└── PostgreSQL 17.6 (Transaction pooler, IPv4)
```

**분리 서비스 운영**: 백엔드(Fly.io)와 프론트엔드(Cloudflare Pages) 독립 배포.

---

## 2. 백엔드 (Fly.io)

### 2.1 fly.toml 설정

| 항목 | 값 |
|------|------|
| App | `weeklit-backend` |
| Region | `nrt` (도쿄) |
| VM | shared-cpu-1x, 512MB |
| Port | 8080 |
| Auto-stop | false (항상 실행) |
| Min machines | 1 |
| Health check | `GET /health` (30s 간격) |

### 2.2 Dockerfile 빌드

```
1. node:20-slim multi-stage build
2. npm ci (전체 워크스페이스)
3. BUILD_FRONTEND=false → 프론트엔드 빌드 스킵
4. backend 빌드: tsc + migrations 복사
5. production: npm ci --omit=dev + 빌드 결과물
6. CMD: start.sh (migrate → server)
```

### 2.3 배포 방법

```bash
# 자동: GitHub Actions (master push 시)
# .github/workflows/deploy-backend.yml
# paths: backend/**, Dockerfile, start.sh, fly.toml

# 수동:
flyctl deploy --remote-only
```

### 2.4 환경변수 (Fly.io secrets)

```bash
flyctl secrets list -a weeklit-backend   # 목록 확인
flyctl secrets set KEY=value             # 설정
```

필수 secrets: `DATABASE_URL`, `CORS_ORIGIN`, `ADMIN_TOKEN`, `GEMINI_API_KEY` 등.
전체 목록은 `backend/src/config/index.ts` 참조.

---

## 3. 프론트엔드 (Cloudflare Pages)

| 항목 | 값 |
|------|------|
| 프로젝트 | `weeklit-net` |
| Git 연결 | GitHub `Ujin-Heo95/trend-korea` master |
| Build command | `cd frontend && npm install && npm run build` |
| Output dir | `frontend/dist` |
| API URL | `VITE_API_BASE_URL=https://api.weeklit.net/api` |

SPA 라우팅: `frontend/public/_redirects` → `/* /index.html 200`

---

## 4. 도메인 & DNS (Cloudflare)

| 레코드 | Type | Target | Proxy |
|--------|------|--------|-------|
| `www` | CNAME | `weeklit-net.pages.dev` | Proxied |
| `@` | CNAME → www 리다이렉트 | — | — |
| `api` | CNAME | `weeklit-backend.fly.dev` | DNS only |

- 도메인 등록: GoDaddy (`weeklit.net`)
- DNS 관리: Cloudflare (Free)
- SSL: Cloudflare (www) + Fly.io 자체 TLS (api)
- `api` 서브도메인은 DNS only (회색 구름) — Fly.io가 TLS 처리

---

## 5. CI/CD

```
git push origin master
  → GitHub Actions CI (.github/workflows/ci.yml)
    → lint + typecheck + test + build
  → Fly.io 자동 배포 (.github/workflows/deploy-backend.yml)
    → backend/**, Dockerfile, start.sh, fly.toml 변경 시
  → Cloudflare Pages 자동 배포
    → Git 연결로 master push 감지 → frontend 빌드
```

---

## 6. 유용한 명령어

```bash
# Fly.io
flyctl status -a weeklit-backend        # 상태
flyctl logs -a weeklit-backend           # 런타임 로그
flyctl secrets list -a weeklit-backend   # 환경변수
flyctl ssh console -a weeklit-backend    # SSH 접속
flyctl deploy --remote-only              # 수동 배포

# Cloudflare Pages
# → Cloudflare 대시보드에서 관리
```

---

## 7. 트러블슈팅

| 증상 | 원인 | 해결 |
|------|------|------|
| API 타임아웃 | Fly.io machine stopped | `auto_stop_machines = false` 확인 |
| CORS 오류 | `CORS_ORIGIN` 미설정 | `flyctl secrets set CORS_ORIGIN=...` |
| 프론트엔드 404 | SPA fallback 누락 | `_redirects` 파일 확인 |
| api.weeklit.net 연결 불가 | Cloudflare 프록시 충돌 | DNS only (회색 구름)로 변경 |
| 마이그레이션 실패 | `start.sh`에서 migrate 실패 | `flyctl logs`로 에러 확인 |
