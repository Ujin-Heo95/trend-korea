# Railway 배포 가이드

> 2026-04-05 기준. 배포 오류 반복 방지를 위한 Railway 전용 문서.

---

## 1. 서비스 구조

```
Railway Project: satisfied-youthfulness
├── trend-korea (단일 서비스) — 백엔드 + 프론트엔드 SPA 서빙
└── (luminous-essence 삭제됨 — 이전 프론트엔드 전용 서비스)
```

**단일 서비스 운영**: 백엔드(Fastify)가 `frontend/dist/`를 정적 서빙.
프론트/백 분리 서비스는 API 프록시 불가 문제로 2026-04-05 폐기.

---

## 2. 빌드 프로세스 (Railpack)

Railway는 **Railpack**(Nixpacks 후속)으로 자동 빌드한다.

### 2.1 Railpack 동작 순서

```
1. 모노레포 감지 (root package.json의 workspaces)
2. npm ci (전체 워크스페이스 의존성 설치)
3. 프론트엔드 자동 빌드 (railpack-frontend 이미지 사용)
   → frontend/package.json의 "build" 실행: tsc && vite build
   → 결과물: frontend/dist/
4. 백엔드 빌드
   → backend/package.json의 "build" 실행: tsc && cp -r src/db/migrations dist/db/migrations
   → 결과물: backend/dist/
5. Docker 이미지 생성 + Railway 레지스트���에 push
```

### 2.2 빌드 스크립트 — 절대 금지 사항

```jsonc
// backend/package.json
{
  // ✅ 올바른 빌드 스크립트
  "build": "tsc && cp -r src/db/migrations dist/db/migrations",

  // ❌ 절대 이렇게 하지 마라 — Railway 빌드 컨텍스트에 ../frontend 없음
  "build": "cd ../frontend && npm run build && cd ../backend && tsc && ..."
}
```

**이유**: Railpack은 각 워크스페이스를 격리된 컨텍스트에서 빌드.
`cd ../frontend`는 빌드 컨테이너에서 경로가 존재하지 않아 `sh: 1: cd: can't cd to ../frontend`로 실패.
프론트엔드 빌드는 Railpack이 `railpack-frontend` 이미지로 **자동** 처리하므로 ��동 지정 불필요.

---

## 3. 시작 프로세스

```jsonc
// backend/package.json
{
  "start": "node dist/db/migrate.js && node dist/server.js"
}
```

**순서**:
1. `migrate.js` — `schema_migrations` 테이블 기반 마이그레이션 (멱등성 보장)
2. `server.js` — Fastify 시작, 스케줄러 등록, 포트 바인딩

**주의**: 마이그레이션 실패 시 `process.exit(1)` → Railway가 컨테이너 재시작.

---

## 4. SPA 정적 파일 서빙

`backend/src/server.ts`에서 조건부 서빙:

```
const frontendDist = resolve(import.meta.dirname, '../../frontend/dist');
```

- `frontend/dist/` 존재 시 → `@fastify/static`으로 정적 파일 서빙
- SPA fallback: `GET` 요청 중 `/api/`로 시작하지 않는 모든 경로 → `index.html`
- 테스트 환경(`NODE_ENV=test`)에서는 비활성화

**Railway에서 `frontend/dist`가 없으면**: 서버는 정상 시작되지��� 프론트엔드 없이 API만 동작 (502 아님, HTML 미반환).

---

## 5. 네트워크 설정

| 항목 | 값 |
|------|------|
| 리전 | US-West |
| 포트 | `PORT` 환경변수 (기본 4000) |
| 호스트 | `0.0.0.0` (모든 인터페이스) |
| Railway 내부 도메인 | `dylyy7pc.up.railway.app` |
| 커스텀 도메인 | `www.weeklit.net` |
| 헬스체크 | `GET /health` (rate limit 제외) |

---

## 6. 도메인 & DNS

| 항목 | 값 |
|------|------|
| 도메인 등록 | GoDaddy (`weeklit.net`) |
| `www` CNAME | **Railway 대시보드에서 확인** (이전: `dylyy7pc.up.railway.app` — 구 서비스) |
| naked domain | GoDaddy 301 리다이렉트 → `www.weeklit.net` (루트 A 레코드 삭제 불가) |
| TXT 레코드 | `_railway-verify.www`, `_railway-verify` 추가 완료 |
| CORS | `https://weeklit.net,https://www.weeklit.net` (www 포함 필수) |
| Railway 내부 도메인 | `trend-korea-production.up.railway.app` (직접 접근 가능) |

**주의**: 커스텀 도메인의 CNAME 타깃은 Railway 서비스별로 다르다.
서비스를 변경/삭제하면 CNAME 타깃도 변경되므로 GoDaddy DNS를 반드시 업데이트해야 한다.
`railway domain` CLI로 확인하거나 Railway 대시보드 → 서비스 → Settings → Networking에서 확인.

---

## 7. 환경변수 전체 목록

### 7.1 필수 (서버 동작에 필요)

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `DATABASE_URL` | `postgresql://localhost:5432/trend_korea` | Supabase Session pooler URL |
| `PORT` | `4000` | Railway가 자동 주입 |
| `NODE_ENV` | `development` | `production` 필수 |
| `CORS_ORIGIN` | `https://weeklit.net,https://www.weeklit.net` | 쉼표 구분 |
| `ADMIN_TOKEN` | (없음, prod에서 경고) | 어드민 대시보드 인증 |

### 7.2 DB 커넥션 풀

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `DB_POOL_MAX` | `10` | 최대 동시 연결 (1-50) |
| `DB_IDLE_TIMEOUT_MS` | `30000` | 유휴 연결 타임아웃 |
| `DB_CONNECTION_TIMEOUT_MS` | `5000` | 연결 획득 타임아웃 |

### 7.3 API 키 (스크래퍼용)

| 변수 | 용도 |
|------|------|
| `YOUTUBE_API_KEY` | YouTube Data API v3 |
| `GEMINI_API_KEY` | Google Gemini Flash (키워드 추출) |
| `KOPIS_API_KEY` | 공연예술통합전산망 |
| `KOBIS_API_KEY` | 영화진흥위원회 박스오피스 |
| `KMDB_API_KEY` | KMDb 영화 포스터/줄거리 |
| `KMA_API_KEY` | 기상청 대기질 |
| `KAKAO_REST_API_KEY` | 카카오 (미사용?) |
| `NAVER_CLIENT_ID` | 네이버 검색 API |
| `NAVER_CLIENT_SECRET` | 네이버 검색 API |
| `BIGKINDS_API_KEY` | 빅카인즈 뉴스 분석 |
| `DATA_GO_KR_API_KEY` | 공공데이터포털 |
| `KCISA_TRAVEL_API_KEY` | 문화정보원 여행 |
| `KCISA_FESTIVAL_API_KEY` | 문화정보원 축제 |
| `KCISA_EVENT_API_KEY` | 문화정보원 행사 |
| `KCISA_PERFORMANCE_API_KEY` | 문화정보원 공연 (CCA) |
| `KCISA_EXHIBITION_API_KEY` | 문화정보원 전시 (CCA) |
| `CULTURE_PERFORMANCE_API_KEY` | 문화포털 공연 |
| `APIFY_API_TOKEN` | Apify SNS 크롤러 (disabled) |
| `APIFY_MONTHLY_BUDGET_CENTS` | `2000` (= $20) |

### 7.4 모니터링

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `SENTRY_DSN` | (없음) | Sentry 에러 트래킹 |
| `DISCORD_WEBHOOK_URL` | (없음) | 에러/알림 Discord 전송 |

### 7.5 SEO

| 변수 | 설명 |
|------|------|
| `BASE_URL` | 기본 `https://weeklit.net` |
| `SITE_NAME` | ��본 `위클릿 — 실시간 트렌드 모아보기` |
| `SITE_DESCRIPTION` | 기본 메타 설명 |
| `GOOGLE_SITE_VERIFICATION` | Google Search Console |
| `NAVER_SITE_VERIFICATION` | Naver Search Advisor |

### 7.6 스크래퍼 설정

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `POST_TTL_DAYS` | `3` | 포스트 자동 삭제 (공연 7일) |
| `SCRAPER_RUNS_TTL_DAYS` | `30` | 실행 로그 보관 기간 |
| `CRAWL_INTERVAL_MINUTES` | `10` | 미사용 (스케줄러가 우선순위별 처리) |

---

## 8. 스케줄러 (UTC 기준)

Railway 서버는 **UTC** 시간대. KST = UTC + 9.

| 주기 | 작업 | 비고 |
|------|------|------|
| 서버 시작 시 | 전체 95개 스크래퍼 1회 실행 | |
| 10분 | high 우선순위 스크래퍼 | 커뮤니티, 트렌딩 |
| 15분 | medium 우선순위 + 트렌드 키워드 추출 | 뉴스 RSS, 기술 |
| 30분 | low 우선순위 스크래퍼 | 정부, 날씨 |
| 5분 | 스코어링 + 이슈 집계 + 요�� | |
| 00:00, 09:00 UTC | Apify SNS 스크래퍼 | 09:00, 18:00 KST |
| 00:00, 12:00 UTC | DB 정리 (TTL 삭제, 용량 체크) | |

---

## 9. Supabase (DB)

| ��목 | 값 |
|------|------|
| Project ID | `aiklmpkeqtnkcmnmnxwd` |
| 리전 | 서울 (ap-northeast-2) |
| 플랜 | Pro ($25/월) |
| PG 버전 | 17.6 |
| 연결 | Session pooler (IPv4) |
| Pooler Host | `aws-1-ap-northeast-2.pooler.supabase.com:5432` |
| SSL | ��동 활성화 (`supabase.com` 감지) |
| 디스크 | 8 GB (Pro 한도) |

---

## 10. CI/CD

```
git push origin master
  → GitHub Actions CI (.github/workflows/ci.yml)
    → lint + backend typecheck + backend test + frontend typecheck + frontend build
  → Railway auto-deploy (master push 감지)
    → Railpack 빌드 → 컨테이너 교체
```

**Railway 수동 배포**: `railway up --detach` (로컬 코드 직접 업로드, CI 우회)

---

## 11. 배포 트러블슈팅

### 빌드 실패 시

```bash
# 최근 배포 목록 확인
railway deployment list

# 특정 배포의 빌드 로그
railway logs --build <DEPLOYMENT_ID>

# 최신 빌드 ���그 (현재 활성 배포)
railway logs -b
```

### 자주 발생하는 문제

| 증상 | 원인 | 해결 |
|------|------|------|
| `cd: can't cd to ../frontend` | 백엔드 build 스크립트에서 프론트엔드 빌드 시도 | **빌드 스크립���에 `cd ../frontend` 절대 넣지 마라**. Railpack이 자동 처리 |
| 502 Bad Gateway | 컨테이너 크래시 또는 빌드 실패 | `railway deployment list`로 FAILED 확인 → 빌드 ��그 점검 |
| 마이그레이션 실패 → 서버 미시작 | `migrate.ts`에 등록 안 된 SQL 파일 | `migrate.ts` 배열에 파일명 추가 |
| `relation "X" does not exist` | 마이그레이션 미적용 또는 DROP 후 참조 | DB 테이블 확인 → 마이그레이션 추가 |
| 프론트엔드 404 | `frontend/dist/` 미생성 | Railpack 빌드 로그에서 `railpack-frontend` 단계 확인 |
| Git push 후 배포 안 됨 | Railway auto-deploy 비활성화 또는 CI 실패 | `railway up --detach`로 수동 배포 |
| 커스텀 도메인 502 + 내부 도메인 200 | CNAME이 구 서비스 도메인을 가리킴 | Railway 대시보드에서 CNAME 타깃 확인 → GoDaddy DNS 업데이트 |
| `x-railway-fallback: true` 헤더 | Railway 엣지가 앱에 연결 불가 | 도메인 라우팅 확인 또는 배포 상태 점검 |

### Railway 유용 명령어

```bash
railway status           # 현재 프로젝트/서비스 확인
railway variables        # 환경변수 목록
railway logs -n 100      # 런타임 로그
railway logs -b          # 빌드 로그
railway deployment list  # 배포 이력
railway up --detach      # 수동 배포 (빌드 링크 출력)
```

---

## 12. Railway 플랜

| 항목 | 값 |
|------|------|
| 플랜 | Hobby ($5/월) |
| 크레딧 | $5/월 사용량 포함 |
| vCPU | 최대 48 (레플리카당 8) |
| RAM | 최대 48 GB (레플리카당 8 GB) |
| 레플리카 | 최대 5개 |
| 로그 보관 | 7일 |
