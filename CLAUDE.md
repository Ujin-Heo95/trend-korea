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
Frontend (React+Vite+Tailwind v4) ──API──> Backend (Fastify 5) ──> PostgreSQL
                                              │
                                              ├── node-cron: 우선순위별 스크래핑 (mutex)
                                              ├── node-cron: 5분마다 트렌드 스코어 갱신
                                              ├── node-cron: 2회/일 TTL 정리
                                              ├── node-cron: 매일 07:00 KST 일일 리포트 생성
                                              ├── 3-Layer 중복제거 (MD5 해시 + Jaccard + Thumbnail)
                                              ├── Gemini Flash: 일일 리포트 LLM 요약 (무료 티어)
                                              ├── Discord 웹훅: 스크래퍼 에러 알림
                                              └── LRU 캐시: 60초 TTL, 200 엔트리
```

상세: [docs/dev/아키텍처.md](docs/dev/아키텍처.md)

## Conventions

### Scrapers
- `BaseScraper` 상속, `fetch(): Promise<ScrapedPost[]>` 구현
- 최대 30개 반환 (`.slice(0, 30)`)
- **소스 등록:** `scrapers/sources.json`에 JSON 6줄 추가 (RSS는 코드 0줄)
- `registry.ts`가 JSON → 스크래퍼 인스턴스 자동 생성 (RSS/HTML/API)
- `p-limit(4)` 동시성 제어 — 최대 4개 병렬 실행
- `BaseScraper.run()`에 retry 2회 (2초, 8초 지수 백오프)
- `ScrapedPost.category` 필드로 카테고리 분류 (movie/performance 전용 탭 지원)
- `ScrapedPost.metadata` 옵션: API 소스의 구조화 데이터 (JSONB)
- 우선순위별 스케줄링: high=10분, medium=15분, low=30분

### Database
- 배치 INSERT + `ON CONFLICT (url) DO NOTHING` (11 columns incl. category, metadata)
- `title_hash` GENERATED 컬럼: 정규화 후 MD5 (괄호/특수문자 제거)
- `post_clusters` + `post_cluster_members`: 중복 게시글 그룹핑
- `post_scores`: 트렌드 스코어 (5분 주기 배치 갱신)
- 환경변수는 `config/index.ts`에서 중앙 파싱 + 검증
- posts TTL: 3일 (기본값), scraper_runs TTL: 30일
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
| 소스 레지스트리 | `backend/src/scrapers/sources.json` |
| 레지스트리 로더 | `backend/src/scrapers/registry.ts` |
| 스크래퍼 실행 | `backend/src/scrapers/index.ts` |
| DB 정리 | `backend/src/db/cleanup.ts` |
| 스케줄러 | `backend/src/scheduler/index.ts` |
| Posts API | `backend/src/routes/posts.ts` |
| Sources API | `backend/src/routes/sources.ts` |
| 중복제거 서비스 | `backend/src/services/dedup.ts` |
| 트렌드 스코어링 | `backend/src/services/scoring.ts` |
| 일일 리포트 서비스 | `backend/src/services/dailyReport.ts` |
| Gemini LLM 서비스 | `backend/src/services/gemini.ts` |
| Discord 알림 | `backend/src/services/discord.ts` |
| Daily Report API | `backend/src/routes/dailyReport.ts` |
| 프론트 홈 | `frontend/src/pages/HomePage.tsx` |
| 일일 리포트 페이지 | `frontend/src/pages/DailyReportPage.tsx` |
| API 클라이언트 | `frontend/src/api/client.ts` |
| LRU 캐시 | `backend/src/cache/lru.ts` |
| 영화 랭킹 테이블 | `frontend/src/components/MovieRankingTable.tsx` |
| 공연 랭킹 테이블 | `frontend/src/components/PerformanceRankingTable.tsx` |
| 키워드 추출 서비스 | `backend/src/services/keywords.ts` |
| 키워드 API | `backend/src/routes/keywords.ts` |
| 이슈태그 페이지 | `frontend/src/pages/KeywordsPage.tsx` |
| CSS 엔트리 | `frontend/src/index.css` |

## Current Phase

**Phase 2 완료** (소스 51개 활성 + 3-Layer 중복제거 + 트렌드 스코어링 + 일일 리포트 MVP + Discord 알림). 다음: Sentry + UptimeRobot + 사용자 참여. 상세: [docs/로드맵.md](docs/로드맵.md)

## 문서 체계

사업부별 하이브리드 구조. 상세: [docs/README.md](docs/README.md)

```
docs/
├── 로드맵.md          CEO 레벨 전체 로드맵
├── planning/          경영기획 (사업계획, 투자, 비용)
├── dev/               개발 (아키텍처, 변경이력, 기술 결정)
├── marketing/         마케팅 (SEO, 수익화)
└── legal/             법무 (스크래핑 법적 검토)
```

### 다음 세션 작업

> 종합 로드맵: [docs/로드맵.md](docs/로드맵.md) | 기술부채: [docs/dev/기술부채.md](docs/dev/기술부채.md)

**Phase 3 진입:**
1. 구글 트렌드 + 네이버 DataLab 프로덕션 데이터 수집 확인
2. Sentry 에러 트래킹 (1시간)
3. UptimeRobot 설정 (30분)
4. Phase 3: 사용자 반응 시스템 (좋아요/북마크)

**보류:**
- Umami Cloud 분석도구 (가입 후 data-website-id를 index.html에 추가)
- 개인정보처리방침 작성
- 도메인 구매 + Cloudflare DNS → sitemap/OG 절대 URL 반영
- 개인사업자등록
