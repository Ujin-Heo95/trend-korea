# Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Railway (Cloud)                         │
│                                                             │
│  ┌────────────────┐        ┌────────────────────────────┐  │
│  │  Frontend       │        │  Backend                    │  │
│  │  React + Vite   │──API──>│  Fastify 5 (Node.js 20)    │  │
│  │  (정적 빌드)    │        │  :4000                      │  │
│  └────────────────┘        └────────────┬───────────────┘  │
│                                         │                   │
│                            ┌────────────▼───────────────┐  │
│                            │  PostgreSQL 16              │  │
│                            │  (Railway, 100MB 한도)      │  │
│                            │                             │  │
│                            │  posts        (수집 데이터) │  │
│                            │  scraper_runs (실행 이력)   │  │
│                            └─────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Backend Data Flow

```
sources.json (통합 레지스트리)
└── registry.ts (로더: RSS 자동생성, HTML/API 동적 import)

node-cron 우선순위 스케줄러
├── 최초 실행: runAllScrapers() — 전체 22개
├── 매 10분: high-priority (커뮤니티, 트렌딩)
├── 매 15분: medium-priority (뉴스 RSS, 테크)
├── 매 30분: low-priority (정부, 기상)
│     └── 각 실행: p-limit 동시성 4, retry 2회
│           ├── logRunStart()  → scraper_runs INSERT
│           ├── scraper.fetch() → HTML/RSS/API 파싱
│           ├── saveToDb()     → posts 배치 INSERT
│           └── logRunEnd()    → scraper_runs UPDATE
│
└── 매일 자정 (UTC):
      ├── cleanOldPosts()        → POST_TTL_DAYS 초과 삭제
      └── cleanOldScraperRuns()  → SCRAPER_RUNS_TTL_DAYS 초과 삭제
```

## Scraper Architecture

```
BaseScraper (base.ts)
├── abstract fetch(): Promise<ScrapedPost[]>  — 각 스크래퍼 구현
├── saveToDb(posts)                           — 배치 INSERT (10 cols, ON CONFLICT 무시)
└── run()                                     — fetch + saveToDb + retry 2회 (2s, 8s 백오프)

구현체 (sources.json 레지스트리에서 로드):
├── HTML/Cheerio: dcinside, bobaedream, ruliweb, theqoo, instiz, natepann, todayhumor
├── RSS (14개):   ppomppu, yna, hani, sbs, donga, khan, hankyung, mk, seoul, kmib,
│                 geeknews, yozm, kma, ppomppu_hot
└── API:          youtube (YouTube Data API v3)
```

## Database Schema

### posts

| Column | Type | Note |
|--------|------|------|
| id | BIGSERIAL | PK |
| source_key | VARCHAR(32) | NOT NULL |
| source_name | VARCHAR(64) | NOT NULL |
| title | TEXT | NOT NULL |
| url | TEXT | NOT NULL, UNIQUE (중복 방지) |
| thumbnail | TEXT | nullable |
| author | VARCHAR(128) | nullable |
| view_count | INTEGER | DEFAULT 0 |
| comment_count | INTEGER | DEFAULT 0 |
| published_at | TIMESTAMPTZ | nullable |
| scraped_at | TIMESTAMPTZ | DEFAULT NOW() |
| category | VARCHAR(32) | nullable (community/video/news/tech 등) |

Indices: `source_key`, `scraped_at DESC`, `view_count DESC`, `category`

### scraper_runs

| Column | Type | Note |
|--------|------|------|
| id | BIGSERIAL | PK |
| source_key | VARCHAR(32) | NOT NULL |
| started_at | TIMESTAMPTZ | DEFAULT NOW() |
| finished_at | TIMESTAMPTZ | nullable |
| posts_saved | INTEGER | nullable |
| error_message | TEXT | nullable (NULL = 성공) |

Indices: `source_key`, `started_at DESC`

## API Endpoints

| Method | Path | Params | Response |
|--------|------|--------|----------|
| GET | /api/posts | source?, page=1, limit=30 (max 100) | `{ posts, total, page, limit }` |
| GET | /api/posts/trending | — | `{ posts }` (1시간 내, view_count 상위 20) |
| GET | /api/sources | — | `Source[]` (22개, post_count, last_updated, success_rate_24h, avg_posts_per_run) |
| GET | /health | — | DB 통계 + 스크래퍼 상태, 503 if DB down |

Rate limit: 100 req/min, CORS: `*`

## Frontend Architecture

### Tech Stack
React 18 + Vite 5 + TypeScript 5.4 + React Query v5 + React Router 6 + Tailwind CSS (CDN)

### Component Tree
```
App
└── BrowserRouter
    └── Layout (헤더 + max-w-5xl)
        └── HomePage
            ├── SourceFilter  — 소스 선택 버튼
            ├── [PostCard]    — 포스트 카드 목록
            └── 페이지네이션  — 이전/다음
```

### Data Fetching (React Query)
| Hook | Refetch | Stale |
|------|---------|-------|
| usePosts(source?, page?) | 30초 | 20초 |
| useTrending() | 30초 | — |
| useSources() | — | 60초 |

## Tech Stack Summary

| Layer | Tech |
|-------|------|
| Backend | Node.js 20, Fastify 5, TypeScript 5.4 |
| DB | PostgreSQL 16, pg 8.11 (Pool) |
| Scraping | cheerio, rss-parser, axios, p-limit |
| Scheduling | node-cron |
| Frontend | React 18, Vite 5, TypeScript 5.4 |
| State | @tanstack/react-query v5 |
| Styling | Tailwind CSS (CDN) |
| Testing | Vitest, axios mock |
| Deploy | Railway (auto-detect, no Dockerfile) |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| DATABASE_URL | postgresql://localhost:5432/trend_korea | PG connection |
| PORT | 4000 | Server port (1-65535) |
| CRAWL_INTERVAL_MINUTES | 10 | Scrape interval |
| POST_TTL_DAYS | 7 | Post retention |
| SCRAPER_RUNS_TTL_DAYS | 30 | Run log retention |
| YOUTUBE_API_KEY | (none) | YouTube scraper; empty = skip |
| NODE_ENV | development | production warns on missing DB URL |
| DB_POOL_MAX | 10 | Max DB connections (1-50) |
| DB_IDLE_TIMEOUT_MS | 30000 | Idle connection timeout |
| DB_CONNECTION_TIMEOUT_MS | 5000 | Connection acquire timeout |
