# WeekLit (위클릿)

한국 주요 커뮤니티 + YouTube + 뉴스에서 실시간 이슈글을 10분마다 수집하는 웹앱.
목표: AdSense 수익화 + 트래픽 확보.

## Quick Start

```bash
cd backend && npm run dev      # localhost:4000
cd frontend && npm run dev     # localhost:5173, proxy → :4000
cd backend && npx vitest run   # 테스트
cd backend && npm run migrate  # DB 마이그레이션
```

## Tech Stack

npm workspaces 모노레포 (`backend/` + `frontend/`), Fly.io 도쿄 + Cloudflare Pages 배포 + Supabase DB (서울, Transaction pooler IPv4).

- **Backend**: Fastify 5, TypeScript, node-cron, cheerio, rss-parser, p-limit — 상세 컨벤션 → `backend/CLAUDE.md`
- **Frontend**: React 18, Vite 5, Tailwind v4, React Query v5 — 상세 컨벤션 → `frontend/CLAUDE.md`
- **DB**: PostgreSQL 17.6 (Supabase Pro 8GB 서울)
- **Testing**: Vitest + axios mock + fixture HTML
- **Deploy**: Fly.io 도쿄 (백엔드) + Cloudflare Pages (프론트엔드) — 상세 → `docs/deploy.md`

## Conventions

- **Git**: Conventional commits (`feat|fix|refactor|docs|test|chore: 설명`)
- **Scrapers**: `BaseScraper` 상속, `sources.json` 레지스트리, 최대 30개, retry 2회
- **DB**: 배치 INSERT + ON CONFLICT UPSERT, TTL 자동 정리 (posts 7일, 공연 7일)
- **환경변수**: `backend/src/config/index.ts`에서 중앙 파싱 + 검증
- **ESLint**: `eslint.config.js` (모노레포 루트), CI에서 검증

## Doc Routing

| 작업 상황 | 읽을 문서 |
|-----------|-----------|
| 시스템 구조 파악 | `docs/architecture.md` |
| 스크래퍼 추가/수정 | `docs/sources.md` |
| 스코어링/중복제거 | `docs/scoring.md` |
| 이슈 랭킹 파이프라인 | `docs/issue_ranking.md` |
| 배포/설정 | `docs/deploy.md` |
| 인프라/비용 결정 | `docs/scaling.md` |
| 비즈니스/수익 분석 | `docs/business/financials.md` |
| 마케팅/SEO | `docs/business/marketing.md` |
| 법적 검토 | `docs/business/legal.md` |
| 기술 의사결정 | `docs/decisions/` (TD-기술, BD-경영) |
| 미해결 기술부채 | `docs/tech-debt.md` |
| 전체 로드맵 | `docs/roadmap.md` |
| 과거 변경 이력 | `git log` |
| 문서 경로 매핑 | `docs/README.md` (구→신 경로) |

## Current Phase

v0.13.0 — 품질·SEO·확장성 대규모 개선 완료.
소스 111개 등록 (78개 활성, 트렌드 3개 → trend_keywords 직접 기록) + 438 tests (백엔드 356 + 프론트 79 + 통합 25) + Supabase Pro 8GB 서울.
채널별 분기 스코어링 — 커뮤니티(소스차등+적응감쇠+트렌드신호) / 뉴스(4항 가산혼합 signalScore+소스별 decay+속보감지+freshnessBonus). 비스코어링 탭은 최신순만.
포털 소스(nate_news/zum_news)는 인기기사를 posts에 수집하며 portalRank 신호에도 통합, 트렌드 소스(google_trends/wikipedia_ko/bigkinds_issues/namuwiki)는 trend_keywords에 직접 UPSERT.

**아키텍처 변경 (2026-04-11)**:
- API/Batch DB 풀 분리 (apiPool 40% + batchPool 60%)
- PipelineRunner: critical step 실패 시 후속 스킵 + Discord 알림
- Worker 프로세스 분리 (`worker.ts` + fly.toml 프로세스 그룹, 활성화 시 `fly scale count worker=1`)
- 피처 플래그: scoring_config 테이블 기반 (embeddings/gemini/crossValidation/apify)
- Supavisor 전환 준비: :6543 감지 시 단일 풀 + keepAlive 비활성
- 서킷 브레이커 DB 영속화 (scraper_circuit_breakers 테이블)
- react-helmet-async 동적 메타 + JSON-LD(WebSite/Article/BreadcrumbList) + 브레드크럼

**완료**: P0 도메인+Umami+URL (2026-04-03) + P1 SEO파이프라인+Security Headers (2026-04-04) + P2 보안·품질·기술부채 전면 해소 (2026-04-04) + 종합 개선 31건 (2026-04-11)
**다음**: P0 사업자·모니터링 (사용자 개입) → P1 런칭·마케팅 → P4 스케일.
상세: `docs/roadmap.md` 참조.
