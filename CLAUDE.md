# Trend Korea

한국 주요 커뮤니티 + YouTube + 뉴스에서 실시간 이슈글을 10분마다 수집하는 웹앱.
목표: AdSense 수익화 + 트래픽 확보.

## Quick Start

```bash
# 백엔드 (localhost:4000)
cd backend && npm run dev

# 프론트엔드 (localhost:5173, proxy → :4000)
cd frontend && npm run dev

# 테스트
cd backend && npx vitest run

# DB 마이그레이션
cd backend && npm run migrate
```

## Architecture

npm workspaces 모노레포 (`backend/` + `frontend/`), Railway 배포.

```
Frontend (React+Vite) ──API──> Backend (Fastify 5) ──> PostgreSQL
                                  │
                                  ├── node-cron: 매 10분 스크래핑
                                  └── node-cron: 매일 자정 TTL 정리
```

상세: [docs/architecture.md](docs/architecture.md)

## Conventions

### Scrapers
- `BaseScraper` 상속, `fetch(): Promise<ScrapedPost[]>` 구현
- 최대 30개 반환 (`.slice(0, 30)`)
- `scrapers/index.ts`의 entries 배열에 등록
- `routes/sources.ts`의 SOURCE_META에 메타데이터 추가
- `p-limit(4)` 동시성 제어 — 최대 4개 병렬 실행
- `BaseScraper.run()`에 retry 2회 (2초, 8초 지수 백오프)
- `ScrapedPost.category` 필드로 카테고리 분류

### Database
- 배치 INSERT + `ON CONFLICT (url) DO NOTHING` (10 columns incl. category)
- 환경변수는 `config/index.ts`에서 중앙 파싱 + 검증
- posts TTL: 7일, scraper_runs TTL: 30일
- DB 풀: `DB_POOL_MAX=10`, `DB_IDLE_TIMEOUT_MS=30000`, `DB_CONNECTION_TIMEOUT_MS=5000`

### Testing
- Vitest + axios mock + fixture HTML 파일
- 테스트 파일: `backend/tests/` (src 미러 구조)

### Git
- Conventional commits: `feat|fix|refactor|docs|test|chore: 설명`

## Key Files

| 역할 | 경로 |
|------|------|
| 앱 진입점 | `backend/src/server.ts` |
| 설정 | `backend/src/config/index.ts` |
| 스크래퍼 베이스 | `backend/src/scrapers/base.ts` |
| 스크래퍼 등록 | `backend/src/scrapers/index.ts` |
| DB 정리 | `backend/src/db/cleanup.ts` |
| 스케줄러 | `backend/src/scheduler/index.ts` |
| Posts API | `backend/src/routes/posts.ts` |
| Sources API | `backend/src/routes/sources.ts` |
| 프론트 홈 | `frontend/src/pages/HomePage.tsx` |
| API 클라이언트 | `frontend/src/api/client.ts` |

## Current Phase

**Scale-Up Phase 2** (소스 레지스트리 + RSS 확장) 진행 예정. 상세: [docs/roadmap.md](docs/roadmap.md)

### 다음 세션 작업 (Scale-Up Phase 2)
1. `sources.json` 통합 레지스트리 구축 (RSS 추가 = JSON 6줄)
2. `registry.ts` 로더 (RSS 자동 생성, HTML/API 동적 import)
3. RSS 9개 추가 (경향/한경/매경/서울/국민/GeekNews/요즘IT/기상청/뽐뿌핫딜) → 13→22개
4. 우선순위별 스케줄링 (high=10분, medium=15분, low=30분)
5. `routes/sources.ts` SOURCE_META → registry 전환
6. `scrapers/rss.ts` RSS_SOURCES 배열 → registry 전환

계획 상세: `.claude/plans/ancient-swinging-ladybug.md`
