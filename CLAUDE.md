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
                                              ├── node-cron: 5분마다 다중 팩터 트렌드 스코어 갱신
                                              ├── node-cron: 2회/일 TTL 정리 (공연 7일, 기타 3일)
                                              ├── node-cron: 매일 07:00 KST 일일 리포트 생성
                                              ├── 3-Layer 중복제거 (MD5 해시 + Jaccard + Thumbnail)
                                              ├── Gemini Flash: 일일 리포트 LLM 요약 (무료 티어)
                                              ├── Discord 웹훅: 스크래퍼 에러 알림
                                              ├── 교차 검증: Google Trends × Naver DataLab × 커뮤니티 (20분, 관련기사+스파크라인)
                                              ├── Gemini Flash: 핫이슈 키워드 추출 (30분 주기)
                                              ├── KOBIS: KMDB 연동 (포스터/감독/줄거리)
                                              ├── KOPIS: 상세 API 연동 (5장르, 공연기간/예매링크)
                                              ├── Apify: SNS 트렌딩 수집 (Instagram/X/TikTok, 일 2회, 월 $20 상한)
                                              └── LRU 캐시: 60초 TTL, 200 엔트리
```

상세: [docs/dev/아키텍처.md](docs/dev/아키텍처.md)

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
- `post_scores`: 다중 팩터 트렌드 스코어 (5분 주기 배치 갱신, Z-Score+Velocity+Momentum+Trend+Cluster)
- `engagement_snapshots`: 스크래핑 시 기존 게시글 조회수/댓글수 이력 (6시간 TTL)
- `source_engagement_stats`: 소스별 Z-Score 정규화용 통계 캐싱
- `keyword_extractions`: 게시글별 고유명사 키워드 (Gemini Flash 추출)
- `keyword_stats`: 시간 윈도우별 키워드 빈도 집계 (3h, 24h)
- `trend_signals`: 교차 검증 트렌드 시그널
- `apify_usage`: Apify Actor 실행 비용 추적 (월간 예산 제어)
- 환경변수는 `config/index.ts`에서 중앙 파싱 + 검증
- posts TTL: 3일 (기본값), 공연 7일, scraper_runs TTL: 30일
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
| DB 용량 모니터링 | `backend/src/services/dbMonitor.ts` |
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
| 교차 검증 서비스 | `backend/src/services/trendCrossValidator.ts` |
| 교차 검증 API | `backend/src/routes/trendSignals.ts` |
| 교차 검증 UI | `frontend/src/components/TrendRadar.tsx` |
| YouTube 키워드 검색 | `backend/src/scrapers/youtube-search.ts` |
| Apify 베이스 | `backend/src/scrapers/apify-base.ts` |
| SNS 랭킹 테이블 | `frontend/src/components/SnsRankingTable.tsx` |
| 공유 컴포넌트 | `frontend/src/components/shared/` (RankBadge, PosterImage, ErrorRetry, ShareButton 등) |
| 서비스 소개 | `frontend/src/pages/AboutPage.tsx` |
| 개인정보처리방침 | `frontend/src/pages/PrivacyPage.tsx` |
| 푸터 | `frontend/src/components/Footer.tsx` |
| 읽음 표시 훅 | `frontend/src/hooks/useReadPosts.ts` |
| ESLint 설정 | `eslint.config.js` |
| CI 워크플로우 | `.github/workflows/ci.yml` |
| CSS 엔트리 | `frontend/src/index.css` |

## Current Phase

**Phase 2.6 진행중** (v0.9.7: 런칭 준비 — CI+ESLint+DB모니터링+에디토리얼+읽음표시+코드스플리팅+테스트60%). 소스 69개 + GitHub Actions CI + ESLint + 일일 리포트 에디토리얼(Gemini 편집자 브리핑) + 읽음 표시(localStorage) + 코드 스플리팅(lazy routes) + 177 tests (60% coverage). 다음: 도메인 구매 + 환경변수 등록 + 런칭. 상세: [docs/로드맵.md](docs/로드맵.md)

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

> 종합 로드맵: [docs/로드맵.md](docs/로드맵.md) | 종합 분석: [docs/planning/종합분석-2026Q1.md](docs/planning/종합분석-2026Q1.md)

**수동 작업 (사용자 직접):**
- `KMDB_API_KEY` Railway 환경변수 추가 (kmdb.or.kr 무료 발급)
- `APIFY_API_TOKEN` Railway 환경변수 추가 (SNS 스크래핑 활성화)
- `APIFY_MONTHLY_BUDGET_CENTS=2000` Railway 환경변수 추가 (월 $20 상한)
- `SENTRY_DSN` Railway 환경변수 추가 (sentry.io 프로젝트 생성 후)
- Umami Cloud 가입 → `data-website-id` 교체 (`frontend/index.html`)
- **도메인 구매 + Cloudflare DNS** — 전 부서 1순위
- UptimeRobot /health 5분 체크 설정
- 개인사업자등록 (홈택스)
- sitemap/canonical/OG 절대 URL 변경 (도메인 확정 후)
- 네이버 서치어드바이저 + Google Search Console (도메인 확정 후)

**Phase 2.6: 런칭 (수동 작업 완료 후)**
- AdSense 신청
- 일일 리포트 에디토리얼 강화 (완료)
- 읽음 표시 (완료)
- 코드 스플리팅 (완료)
- GitHub Actions CI (완료)
- ESLint (완료)
- DB 용량 모니터링 알림 (완료)
- 백엔드 테스트 커버리지 60% (완료)

**Phase 3: 사용자 참여 + 성장**
- 내부 이슈 상세 페이지 (외부 이탈 방지, 체류시간 핵심)
- Supabase 무료 마이그레이션 (500MB, 서울)
- 사용자 반응 시스템 (좋아요/북마크)
- 카카오톡 채널 + 일일 다이제스트
