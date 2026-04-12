# Architecture

> 2026-04-12 현행화. 111개 등록 / 78개 활성. 스코어링·요약 파이프라인 v7 재설계 진행 중 (`plans/luminous-drifting-shell.md`).

## System Overview

```
┌─────────────────┐          ┌──────────────────────────────────┐
│  Frontend        │          │  Backend                          │
│  Cloudflare Pages│───API───>│  Fly.io 도쿄 (nrt)               │
│  React 18+Vite 5 │          │  Fastify 5 (Node.js 20)          │
│  www.weeklit.net │          │  api.weeklit.net (:8080)          │
│                  │          │  + node-cron 스케줄러             │
└─────────────────┘          └──────────────┬───────────────────┘
                                            │
                                               │
                              ┌─────────────────▼────────────────┐
                              │  PostgreSQL 17.6                  │
                              │  Supabase Pro (서울, 8GB)      │
                              │  Transaction pooler (IPv4), SSL   │
                              └──────────────────────────────────┘

외부 API:
├── Google Gemini Flash (키워드 추출, 일일 리포트)
├── YouTube Data API v3 (disabled — 할당량 초과)
├── KOBIS 박스오피스 + KMDB 포스터/줄거리
├── KOPIS 예매순위 + 상세 API
├── Naver DataLab (검색 트렌드)
├── Kakao REST API (다음 카페/블로그 검색)
├── BigKinds API (오늘의 이슈 Top 10)
├── KMA 기상청 API (날씨)
├── Discord Webhooks (에러 알림)
└── Sentry (에러 트래킹)
```

## Backend Data Flow

```
sources.json (111개 소스 레지스트리, 78개 활성)
└── registry.ts (로더: RSS 자동생성, HTML/API 동적 import)

node-cron 우선순위 스케줄러 (8개 크론 잡)
├── 최초 실행: runAllScrapers() — 활성 소스 전체
├── 매 10분: high-priority (커뮤니티, 주요 뉴스)
├── 매 15분: medium-priority (뉴스 RSS, 테크, 금융, 커뮤니티 일부)
├── 매 30분: low-priority (정부, YouTube RSS, 음악/영화/공연, 도서)
│     └── 각 실행: p-limit(4) 동시성, 30초 타임아웃, retry 2회 (2s→8s backoff)
│           ├── logRunStart()  → scraper_runs INSERT
│           ├── scraper.fetch() → HTML/RSS/API 파싱
│           ├── saveToDb()     → posts 배치 INSERT (UPSERT)
│           ├── recordEngagementSnapshots() → 기존글 조회수/댓글 이력
│           ├── clusterPosts() → 3-Layer 중복제거 (영화/공연 스킵)
│           └── logRunEnd()    → scraper_runs UPDATE
│
├── 매 5분: calculateScores() → post_scores 다중 팩터 배치 갱신
│     ├── calculateSourceStats()         → Z-Score 정규화 (소스별 통계)
│     ├── calculateVelocityMap()         → engagement 스냅샷 기반 증가 속도
│     ├── calculateKeywordMomentumMap()  → 3h/24h 키워드 가속도
│     ├── calculateTrendConfirmationMap()→ 교차검증 시그널 연동
│     ├── calculateClusterBonusMap()     → 로그 곡선 + 소스 다양성
│     └── calculateCategoryBaselines()   → Bayesian Prior
│
├── 매 30분: extractKeywords() → Gemini Flash 키워드 추출 → keyword_stats 집계
├── 매일 22:00 UTC (07:00 KST): generateDailyReport() → Gemini Flash 요약
│
├── 매일 00:00, 12:00 UTC:
│     ├── cleanOldPosts()               → 3일 초과 삭제 (공연 7일)
│     ├── cleanOldScraperRuns()         → 30일 초과 삭제
│     ├── cleanExpiredTrendSignals()    → 24시간 만료 시그널 삭제
│     ├── cleanOldEngagementSnapshots() → 6시간 초과 스냅샷 삭제
│     └── checkDbSize()                 → 400MB 경고, 475MB 위험 (Discord)
│
└── Discord 웹훅: 스크래퍼 에러 배치 알림, API 키 실패 알림 (1h 쿨다운)
```

## Scraper Architecture

```
BaseScraper (base.ts)
├── abstract fetch(): Promise<ScrapedPost[]>  — 각 스크래퍼 구현
├── saveToDb(posts)     — 배치 INSERT + ON CONFLICT UPSERT
├── recordEngagementSnapshots(posts) — 기존글 조회수/댓글 이력
└── run()               — fetch + saveToDb + clusterPosts + retry 2회

소스 유형별 (sources.json 레지스트리):
├── HTML/Cheerio (27개 활성): dcinside, bobaedream, ruliweb, theqoo, instiz,
│     natepann, todayhumor, clien, fmkorea, mlbpark, cook82,
│     inven, humoruniv, ygosu, slrclub, etoland, dogdrip, geeknews,
│     naver_news_ranking, melon_chart, bugs_chart, genie_chart,
│     kworb_spotify_kr, kworb_youtube_kr, yes24, aladin, flixpatrol,
│     nate_news, zum_news, clien_jirum, quasarzone_deal
│     (disabled: arcalive, ppomppu_best)
├── RSS (37개 활성): ddanzi, yna, hani, sbs, donga, khan, hankyung, mk, kmib,
│     yozm, google_trends, newsis, chosun, jtbc, etnews, newswire,
│     ppomppu_hot, investing_kr, sedaily, moneytoday, edaily, bizwatch,
│     korea_press/policy/briefing, uppity, google_news_kr, bbc_korean,
│     ohmynews, nocutnews, asiae, segye, mbn, boannews, zdnet_kr,
│     itworld_kr, traveltimes, youtube_sbs/ytn/mbc/kbs/jtbc_news
├── API (12개 활성): kobis_boxoffice, kopis_boxoffice,
│     bigkinds_issues, airkorea, wikipedia_ko, tour_photo,
│     seoul_cultural_event, kcisa_cca_performance, kcisa_cca_exhibition
└── Apify (3개 비활성): instagram, x, tiktok (SNS 플랫폼 제약)

총계: 111개 등록, 78개 활성 (community 17, news 25, portal 5, deals 6, video 5, music 5, government 3, trend 3, tech 2, books 2, ott 1, movie 1, webtoon 1, performance 1, alert 1; travel/techblog/sns/sports 일시 비활성)
```

## Database Schema

### 핵심 테이블

#### posts

| Column | Type | Note |
|--------|------|------|
| id | BIGSERIAL | PK |
| source_key | VARCHAR(32) | NOT NULL |
| source_name | VARCHAR(64) | NOT NULL |
| title | TEXT | NOT NULL |
| url | TEXT | NOT NULL, UNIQUE |
| thumbnail | TEXT | nullable |
| author | VARCHAR(128) | nullable |
| view_count | INTEGER | DEFAULT 0 |
| comment_count | INTEGER | DEFAULT 0 |
| vote_count | INTEGER | DEFAULT 0 |
| published_at | TIMESTAMPTZ | nullable |
| scraped_at | TIMESTAMPTZ | DEFAULT NOW() |
| category | VARCHAR(32) | nullable |
| title_hash | VARCHAR(32) | GENERATED — MD5(정규화 제목) |
| metadata | JSONB | nullable — 구조화 데이터 |

Indices: `source_key`, `scraped_at DESC`, `view_count DESC`, `category`, `title_hash`
TTL: 7일 (공연 7일)

#### post_scores

| Column | Type | Note |
|--------|------|------|
| post_id | BIGINT | FK → posts(id), UNIQUE |
| trend_score | FLOAT | DEFAULT 0 |
| source_weight | FLOAT | DEFAULT 1.0 |
| category_weight | FLOAT | DEFAULT 1.0 |
| calculated_at | TIMESTAMPTZ | DEFAULT NOW() |

5분 주기 배치 갱신.
공식: `normalized_engagement × decay(6h 반감기) × source_weight × category_weight × velocity × cluster_bonus × keyword_momentum × trend_confirmation`

### 중복제거

#### post_clusters / post_cluster_members

3-Layer 중복제거:
- **L1**: title_hash (MD5 정규화, 괄호/특수문자 제거)
- **L2**: Jaccard 바이그램 유사도 (0.8 임계값)
- **L3**: Thumbnail URL 매칭

영화/공연 카테고리는 클러스터 dedup 스킵.

### 참여도 추적

#### engagement_snapshots

| Column | Type | Note |
|--------|------|------|
| post_id | BIGINT | FK → posts(id) |
| view_count | INTEGER | 스냅샷 시점 조회수 |
| comment_count | INTEGER | 스냅샷 시점 댓글수 |
| captured_at | TIMESTAMPTZ | DEFAULT NOW() |

스크래퍼 실행 시 기존 게시글 engagement 기록. 6시간 TTL.

#### source_engagement_stats

소스별 24시간 평균/표준편차 (log 스케일). Z-Score 정규화용.

### 키워드

#### keyword_extractions

게시글별 Gemini Flash 추출 키워드. `UNIQUE(post_id)`.

#### keyword_stats

시간 윈도우별 키워드 빈도 집계 (3h, 24h). `UNIQUE(keyword, window_hours)`.

### 트렌드 시그널

#### trend_signals

| Column | Type | Note |
|--------|------|------|
| keyword | TEXT | NOT NULL |
| google_traffic | TEXT | "1M+", "500K+" |
| naver_change_pct | INTEGER | 변화율 % |
| naver_trend_data | JSONB | 일별 트렌드 데이터 |
| community_mentions | INTEGER | DEFAULT 0 |
| convergence_score | FLOAT | DEFAULT 0 |
| signal_type | VARCHAR(20) | confirmed / google_only |
| detected_date | DATE | UNIQUE(keyword, detected_date) |
| expires_at | TIMESTAMPTZ | DEFAULT NOW() + 24h |

### 일일 리포트

#### daily_reports / daily_report_sections

일일 리포트 메타 + 카테고리별 섹션 (rank, post_id, summary, category_summary).
editorial_keywords, editorial_briefing, editorial_watch_point (Gemini Flash).

### 투표 / 사용량 추적

#### post_votes

IP hash(SHA256 16자) 기반 중복 방지. `UNIQUE(post_id, ip_hash)`.

#### apify_usage

Apify actor별 비용 추적. 월간 예산 게이트 (기본 $20).

#### schema_migrations

마이그레이션 실행 이력 추적. 중복 실행 방지.

---

## API Endpoints

| Method | Path | Auth | Cache | 설명 |
|--------|------|------|-------|------|
| GET | `/api/posts` | - | LRU 200/60s | 페이지네이션, 필터(source/category/q/sort) |
| GET | `/api/sources` | - | - | 소스 목록 + 통계 |
| GET | `/api/keywords` | - | LRU 10/5m | 키워드 빈도 (window: 3/24h) |
| GET | `/api/trends/signals` | - | LRU 10/60s | BigKinds 교차검증 시그널 |
| GET | `/api/topics` | - | LRU 5/60s | 토픽 클러스터 (키워드 기반) |
| GET | `/api/posts/:postId` | - | LRU 200/60s | 이슈 상세 (클러스터, 시그널, engagement, 관련기사) |
| GET | `/api/daily-report/latest` | - | LRU 30/5m | 최신 리포트 메타 |
| GET | `/api/daily-report/:date` | - | LRU 30/5m | 특정 날짜 리포트 |
| POST | `/api/daily-report/generate` | ADMIN | - | 리포트 수동 생성 |
| POST | `/api/posts/:postId/vote` | - | - | Upvote (IP hash dedup) |
| GET | `/api/weather/cities` | - | - | 도시 목록 |
| GET | `/api/weather/:cityCode` | - | - | 날씨 데이터 |
| GET | `/health` | ADMIN(상세) | - | 공개: status. 인증: DB/스크래퍼/API 상세 |

Rate limit: 200 req/min (global). CORS: `weeklit.net` (프로덕션).

---

## Frontend Architecture

### Tech Stack

React 18 + Vite 5 + TypeScript 5.4 + React Query v5 + React Router 6 + Tailwind CSS v4 (PostCSS)

### 페이지 구조

| 페이지 | 경로 | 설명 |
|--------|------|------|
| HomePage | `/` | 메인 피드 (무한스크롤, 카테고리 탭, 검색, TrendHero, TrendRadar) |
| IssueDetailPage | `/issue/:postId` | 이슈 상세 (클러스터, 트렌드, 참여추이, 관련기사) |
| DailyReportPage | `/daily-report/:date` | 일일 리포트 (에디토리얼 + 카테고리별 Top 3) |
| KeywordsPage | `/keywords` | 핫 키워드 (3h/24h 토글) |
| WeatherPage | `/weather` | 날씨 (도시 선택, 시간별/일별) |
| AboutPage | `/about` | 서비스 소개 |
| PrivacyPage | `/privacy` | 개인정보처리방침 |

### 컴포넌트 트리

```
App (ErrorBoundary + QueryClientProvider + BrowserRouter)
└── Layout (헤더 + Footer + MobileBottomNav)
    └── Suspense (PageLoader)
        ├── HomePage
        │   ├── TrendHero        — 토픽 카드 (모멘텀 표시)
        │   ├── TrendRadar       — BigKinds 뉴스 이슈
        │   ├── CategoryTabs     — 8개 카테고리
        │   ├── SearchBar        — 디바운스 400ms
        │   ├── SourceFilterChips— 커뮤니티 소스 필터
        │   ├── [PostCard]       — 일반 포스트 (순위, 클러스터, 투표, 공유)
        │   ├── MovieRankingTable— 영화 (포스터, 관객수, 외부링크)
        │   ├── PerformanceRankingTable — 공연
        │   ├── SnsRankingTable  — SNS
        │   └── InfiniteScroll   — IntersectionObserver, 200px rootMargin
        ├── IssueDetailPage
        │   ├── EngagementChart  — SVG 참여도 추이
        │   ├── Sparkline        — 미니 차트
        │   ├── ShareButton      — 카카오 + 링크복사
        │   └── VoteButton       — Upvote
        └── DailyReportPage
            └── 카테고리별 섹션 + 에디토리얼
```

### Data Fetching (React Query)

| Hook | refetchInterval | staleTime |
|------|-----------------|-----------|
| useInfinitePosts | 60s | 60s |
| useTrending | 60s | 60s |
| useSources | - | 60s |
| useTrendSignals | 60s | 30s |
| useTopics | 60s | 30s |
| useIssueDetail | - | 60s |

### 상태 관리

- **서버 상태**: React Query (캐시, 백그라운드 리프레시)
- **URL 상태**: useSearchParams (category, q, city)
- **로컬 상태**: localStorage — 읽음 표시(3d TTL), 투표(7d TTL)

### 코드 스플리팅

- React.lazy 페이지 단위
- Vendor chunks: `vendor-react`, `vendor-query`, `vendor-axios`

### PWA

- Service Worker: network-first (API), cache-first (assets), network-first (navigation → /index.html 폴백)
- Manifest: standalone, ko, theme-color #2563eb

---

## 환경 변수

| Variable | Default | Description |
|----------|---------|-------------|
| DATABASE_URL | postgresql://localhost:6543/trend_korea | PG 연결 문자열 (Transaction pooler) |
| PORT | 4000 | 서버 포트 (1-65535) |
| CRAWL_INTERVAL_MINUTES | 10 | 스크래핑 주기 |
| POST_TTL_DAYS | 7 | 게시글 보존 기간 (공연 7일) |
| SCRAPER_RUNS_TTL_DAYS | 30 | 실행 로그 보존 |
| CORS_ORIGIN | https://weeklit.net | CORS 허용 origin |
| ADMIN_TOKEN | (none) | 어드민 엔드포인트 인증 |
| DB_POOL_MAX | 15 | 최대 DB 연결 (1-50) |
| DB_IDLE_TIMEOUT_MS | 20000 | idle 연결 타임아웃 |
| DB_CONNECTION_TIMEOUT_MS | 10000 | 연결 획득 타임아웃 |
| YOUTUBE_API_KEY | (none) | YouTube 인기/검색 |
| GEMINI_API_KEY | (none) | Gemini Flash (키워드, 리포트) |
| KOBIS_API_KEY | (none) | KOBIS 박스오피스 |
| KOPIS_API_KEY | (none) | KOPIS 예매순위 |
| KMDB_API_KEY | (none) | KMDB 포스터/줄거리 |
| KMA_API_KEY | (none) | 기상청 API |
| KAKAO_REST_API_KEY | (none) | 다음 카페/블로그 검색 |
| NAVER_CLIENT_ID | (none) | Naver DataLab |
| NAVER_CLIENT_SECRET | (none) | Naver DataLab |
| BIGKINDS_API_KEY | (none) | 빅카인즈 이슈 |
| APIFY_API_TOKEN | (none) | Apify SNS 스크래핑 |
| APIFY_MONTHLY_BUDGET_CENTS | 2000 | Apify 월 예산 ($20) |
| DISCORD_WEBHOOK_URL | (none) | 에러/알림 웹훅 |
| SENTRY_DSN | (none) | Sentry 에러 트래킹 |

---

## 테스트

| 영역 | 프레임워크 | 현재 |
|------|-----------|------|
| 백엔드 단위 | Vitest + nock | 286 tests (40 files) |
| 프론트엔드 | Vitest + @testing-library/react + jsdom | 40 tests (4 files) |
| E2E | Playwright | 5 tests (happy path) |

## CI/CD

- **GitHub Actions**: lint (ESLint flat config) → typecheck (tsc --noEmit) → test (vitest) → build
- **배포**: Fly.io (백엔드, GitHub Actions) + Cloudflare Pages (프론트엔드, Git 연결)
