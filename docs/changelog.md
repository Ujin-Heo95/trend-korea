# Changelog

## v0.4.0 (2026-03-29) — Scale-Up Phase 1: 수집 인프라 기반

### Added
- `p-limit(4)` 동시성 제어 (무제한 병렬 → 최대 4개)
- `BaseScraper.run()` retry 2회 + 지수 백오프 (2초, 8초)
- DB 풀 설정 (`DB_POOL_MAX`, `DB_IDLE_TIMEOUT_MS`, `DB_CONNECTION_TIMEOUT_MS`)
- Pool idle error 핸들러
- `category` 컬럼 (posts 테이블, 마이그레이션 003)
- `ScrapedPost.category` 필드
- 프로젝트 문서 체계 (CLAUDE.md, docs/architecture, roadmap, changelog, ADR 4개)

### Removed
- `fmkorea.ts` dead code 삭제

---

## v0.3.0 (2026-03-29) — Phase 1: 소스 확장 + DB 관리

### Added
- bobaedream (보배드림) HTML 스크래퍼
- todayhumor (오늘의유머) HTML 스크래퍼
- SBS 뉴스, 동아일보 RSS 소스
- `cleanOldScraperRuns()` — scraper_runs 30일 TTL 자동 정리
- `/api/sources`에 `success_rate_24h`, `avg_posts_per_run` 통계

### Changed
- dcinside 셀렉터 갱신 (`realtime_best_p` 섹션)
- instiz 셀렉터 갱신 (조회수 파싱 추가)
- natepann: RSS → HTML/Cheerio 전환
- ruliweb: RSS → HTML/Cheerio 전환

### Removed
- clien, chosun, joins RSS (장기 장애)
- fmkorea (HTML 차단)

---

## v0.2.0 (2026-03) — 스크래퍼 인프라

### Added
- `scraper_runs` 테이블 + 순차 마이그레이션 시스템
- 배치 INSERT (`ON CONFLICT DO NOTHING`)
- `logRunStart()` / `logRunEnd()` 감사 로깅
- `POST_TTL_DAYS` 환경변수 + 자정 cleanup cron
- `/health` 엔드포인트 (DB 통계 + 스크래퍼 상태)
- PORT, CRAWL_INTERVAL_MINUTES NaN 검증

### Fixed
- `logRunStart` 실패 시 catch 추가
- `allSettled` rejection 로깅 추가

---

## v0.1.0 (2026-03) — 초기 MVP

### Added
- npm workspaces 모노레포 (backend + frontend)
- PostgreSQL 스키마 (posts 테이블)
- BaseScraper 추상 클래스
- 14개 스크래퍼: DC인사이드, 에펨코리아, 루리웹, 더쿠, 인스티즈, 네이트판, 클리앙, 뽐뿌, 오늘의유머, YouTube, 연합뉴스, 조선일보, 한겨레, 중앙일보
- node-cron 10분 주기 스케줄링
- Fastify 서버 (`/api/posts`, `/api/sources`)
- React + Vite 프론트엔드 (SourceFilter, PostCard, HomePage)
- Railway 배포
