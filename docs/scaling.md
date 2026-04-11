# 인프라 스케일링 경로

> 2026-04-11 현행화. Fly.io 도쿄 + Supabase Pro 서울 기준.

---

## 1. 현재 상태

| 구성요소 | 현재 | 비용 |
|----------|------|------|
| 백엔드 | Fly.io 도쿄 (nrt), shared-cpu-1x 512MB | ~$5/월 |
| DB | **PostgreSQL 17.6 on Supabase Pro (서울, 8GB)** | $25/월 |
| 프론트엔드 | Cloudflare Pages (글로벌 CDN) | $0 |
| 캐싱 | LRU 인메모리 캐시 (라우트별 TTL) + Cache-Control 헤더 | $0 |
| 모니터링 | Sentry (에러) + Discord 웹훅 (알림) + `/health` | $0 |
| 분석 | Umami (self-hosted) | $0 |
| CI/CD | GitHub Actions + Fly.io deploy + Cloudflare Git 연결 | $0 |
| 도메인 | weeklit.net (GoDaddy, Cloudflare DNS) | ~$1/월 |

---

## 2. DB 스케일링

### 2.1 현재 용량

- Supabase Pro 8GB, 서울 리전
- TTL: posts 7일, 공연 7일, scraper_runs 30일, engagement_snapshots 6시간
- 자동 정리: 매일 00:00/12:00 UTC
- 모니터링: 400MB 경고, 475MB 위험 (Discord 알림)

### 2.2 인덱스 (구현 완료)

```sql
idx_posts_source_key           -- 소스 필터
idx_posts_scraped_at DESC      -- 시간 정렬
idx_posts_view_count DESC      -- 트렌딩 쿼리
idx_posts_category             -- 카테고리 필터
idx_posts_category_scraped_at  -- 카테고리+시간 복합
idx_posts_title_hash           -- 중복제거
```

### 2.3 미래 스케일링

| DAU | 솔루션 | 비용 |
|-----|--------|------|
| <2K | 현재 구성 유지 | $30/월 |
| 2K-10K | Supabase Pro + pg_trgm 검색 인덱스 | $30/월 |
| 10K+ | Supabase Pro + 읽기 복제본 | $50-80/월 |

### 2.4 전문 검색

| 방법 | 비용 | 적용 시점 |
|------|------|----------|
| ILIKE (현재) | $0 | ~10K rows |
| pg_trgm GIN 인덱스 | $0 | 10K-100K rows |
| Meilisearch | $5-40/월 | 100K+ rows |

---

## 3. 캐싱 전략

### 3.1 구현 완료

**Cache-Control 헤더 (라우트별):**
- `/api/posts` → 30s (stale 1m)
- `/api/sources` → 5m (stale 10m)
- `/api/issues` → 1m (stale 5m)

**인메모리 LRU 캐시:**
- 라우트별 TTL (30s~5m), 최대 200 엔트리
- 스크래퍼 완료 시 캐시 무효화

### 3.2 미래 단계

| 단계 | 조건 | 솔루션 |
|------|------|--------|
| 현재 | 단일 프로세스 | LRU 캐시 (충분) |
| 수평 스케일링 시 | 멀티 인스턴스 | Redis — Upstash ($5/월) |

> Redis는 현재 과잉. 인메모리 LRU로 단일 프로세스 10K DAU까지 충분.

---

## 4. 스크래퍼 아키텍처

### 4.1 현재 구현

- node-cron 우선순위 스케줄러 (high 10분 / medium 15분 / low 30분)
- p-limit(4) 동시성 제한
- mutex flag + 5분 타임아웃 (중복 실행 방지)
- retry 2회 (2s→8s backoff), 30초 타임아웃
- Discord 웹훅 에러 배치 알림

### 4.2 미래 단계

| 조건 | 솔루션 |
|------|--------|
| 현재 | mutex + p-limit (충분) |
| 멀티 인스턴스 | worker 프로세스 분리 (~10줄 변경) |
| 50K+ DAU | BullMQ + Redis 잡 큐 |

---

## 5. 모니터링 & 알림

### 5.1 현재 구현

| 영역 | 도구 |
|------|------|
| 에러 추적 | Sentry (무료) |
| 알림 | Discord 웹훅 (스크래퍼 에러, API 키 실패, DB 용량) |
| 가동시간 | `/health` 엔드포인트 (Fly.io 자동 헬스체크 30s) |
| 로깅 | pino (Fastify 내장) — 구조화 JSON |
| 분석 | Umami |

### 5.2 핵심 알림 임계값

| 메트릭 | 임계값 | 액션 |
|--------|--------|------|
| db_size_mb > 400 | 경고 | TTL 축소 검토 |
| db_size_mb > 475 | 위험 | 즉시 대응 |
| scraper_success_rate < 80% | 위험 | 소스별 진단 |
| 연속 3회 scraper 실패 | 위험 | Discord 알림 |

---

## 6. SSR 전략

### 채택: 경량 접근

1. **봇 프리렌더** (구현 완료): Fastify 미들웨어에서 봇 UA 감지 → 동적 meta/OG/canonical 주입
2. **sitemap.xml** (구현 완료): 동적 생성 (이슈 500개 + 리포트 30일)
3. **필요 시**: `vite-plugin-ssr` (vike) 추가 — 기존 코드 유지하며 SSR

> Next.js 마이그레이션은 기각됨 — 라우팅/빌드 전면 재작성 필요, 현재 단일 페이지 앱에 과잉.

---

## 7. 비용 예측 (상세: business/financials.md)

| DAU | 인프라 비용 | 주요 구성 |
|-----|-----------|-----------|
| <2K | ~$30 | Fly.io + Supabase Pro + 도메인 |
| 2K-10K | $50-100 | + Sentry Pro + 필요 시 Redis |
| 10K+ | $150-250 | + 읽기 복제본 + Datadog lite |
