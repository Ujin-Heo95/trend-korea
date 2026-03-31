# Backend — Fastify 5 + TypeScript + PostgreSQL (Supabase 서울)

## Conventions

### Scrapers
- `BaseScraper` 상속, `fetch(): Promise<ScrapedPost[]>` 구현
- 최대 30개 반환 (`.slice(0, 30)`)
- **소스 등록:** `scrapers/sources.json`에 JSON 6줄 추가 (RSS는 코드 0줄)
- `registry.ts`가 JSON → 스크래퍼 인스턴스 자동 생성 (RSS/HTML/API/Apify)
- `p-limit(4)` 동시성 제어 — 최대 4개 병렬 실행
- `BaseScraper.run()`에 retry 2회 (2초, 8초 지수 백오프)
- `ScrapedPost.category` 필드로 카테고리 분류 (movie/performance 전용 탭 지원)
- `ScrapedPost.metadata` 옵션: API 소스의 구조화 데이터 (JSONB)
- 우선순위별 스케줄링: high=10분, medium=15분, low=30분

### Database
- 배치 INSERT + `ON CONFLICT (url) DO UPDATE` engagement UPSERT (일반), 전체 UPSERT (영화/공연)
- `title_hash` GENERATED 컬럼: 정규화 후 MD5 (괄호/특수문자 제거)
- `post_clusters` + `post_cluster_members`: 중복 게시글 그룹핑
- `post_scores`: 다중 팩터 트렌드 스코어 (5분 주기 배치 갱신)
- posts TTL: 3일 (기본값), 공연 7일, scraper_runs TTL: 30일
- 환경변수는 `config/index.ts`에서 중앙 파싱 + 검증
- DB 풀: `DB_POOL_MAX=10`, `DB_IDLE_TIMEOUT_MS=30000`, `DB_CONNECTION_TIMEOUT_MS=5000`

### Testing
- Vitest + axios mock + fixture HTML 파일
- 테스트 파일: `tests/` (src 미러 구조)

## Key Files

| 역할 | 경로 |
|------|------|
| 앱 진입점 | `src/server.ts` |
| 설정 | `src/config/index.ts` |
| 스크래퍼 베이스 | `src/scrapers/base.ts` |
| 소스 레지스트리 | `src/scrapers/sources.json` |
| 레지스트리 로더 | `src/scrapers/registry.ts` |
| 스크래퍼 실행 | `src/scrapers/index.ts` |
| DB 정리 | `src/db/cleanup.ts` |
| 스케줄러 | `src/scheduler/index.ts` |
| Posts API | `src/routes/posts.ts` |
| Sources API | `src/routes/sources.ts` |
| 중복제거 서비스 | `src/services/dedup.ts` |
| 트렌드 스코어링 | `src/services/scoring.ts` |
| 일일 리포트 서비스 | `src/services/dailyReport.ts` |
| Gemini LLM 서비스 | `src/services/gemini.ts` |
| Discord 알림 | `src/services/discord.ts` |
| DB 용량 모니터링 | `src/services/dbMonitor.ts` |
| Daily Report API | `src/routes/dailyReport.ts` |
| 이슈 상세 API | `src/routes/issueDetail.ts` |
| 키워드 추출 서비스 | `src/services/keywords.ts` |
| 키워드 API | `src/routes/keywords.ts` |
| 교차 검증 서비스 | `src/services/trendCrossValidator.ts` |
| 교차 검증 API | `src/routes/trendSignals.ts` |
| YouTube 키워드 검색 | `src/scrapers/youtube-search.ts` |
| Daum 검색 스크래퍼 | `src/scrapers/daum-search.ts` |
| Apify 베이스 | `src/scrapers/apify-base.ts` |
| API 키 헬스체크 | `src/services/apiKeyHealth.ts` |
| 투표 API | `src/routes/votes.ts` |
| LRU 캐시 | `src/cache/lru.ts` |

## Deep Dive

- 시스템 아키텍처 상세: `docs/architecture.md`
- 스코어링/중복제거 설계: `docs/scoring.md`
- 소스 카탈로그 + 추가 가이드: `docs/sources.md`
