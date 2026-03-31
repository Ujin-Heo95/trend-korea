# Trend Korea

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

npm workspaces 모노레포 (`backend/` + `frontend/`), Railway 배포 + Supabase DB (서울, Session pooler IPv4).

- **Backend**: Fastify 5, TypeScript, node-cron, cheerio, rss-parser, p-limit — 상세 컨벤션 → `backend/CLAUDE.md`
- **Frontend**: React 18, Vite 5, Tailwind v4, React Query v5 — 상세 컨벤션 → `frontend/CLAUDE.md`
- **DB**: PostgreSQL 17.6 (Supabase 500MB 무료)
- **Testing**: Vitest + axios mock + fixture HTML
- **Deploy**: Railway auto-detect, Supabase 서울 리전

## Conventions

- **Git**: Conventional commits (`feat|fix|refactor|docs|test|chore: 설명`)
- **Scrapers**: `BaseScraper` 상속, `sources.json` 레지스트리, 최대 30개, retry 2회
- **DB**: 배치 INSERT + ON CONFLICT UPSERT, TTL 자동 정리 (posts 3일, 공연 7일)
- **환경변수**: `backend/src/config/index.ts`에서 중앙 파싱 + 검증
- **ESLint**: `eslint.config.js` (모노레포 루트), CI에서 검증

## Doc Routing

| 작업 상황 | 읽을 문서 |
|-----------|-----------|
| 시스템 구조 파악 | `docs/architecture.md` |
| 스크래퍼 추가/수정 | `docs/sources.md` |
| 스코어링/중복제거 | `docs/scoring.md` |
| 인프라/비용 결정 | `docs/scaling.md` |
| 비즈니스/수익 분석 | `docs/business/financials.md` |
| 마케팅/SEO | `docs/business/marketing.md` |
| 법적 검토 | `docs/business/legal.md` |
| 기술 의사결정 | `docs/decisions/` (TD-기술, BD-경영) |
| 미해결 기술부채 | `docs/tech-debt.md` |
| 전체 로드맵 | `docs/roadmap.md` |
| 과거 변경 이력 | `git log` 또는 `docs/archive/changelog.md` |
| 문서 경로 매핑 | `docs/README.md` (구→신 경로) |

## Current Phase

v0.10.2 — Phase 3 진행중. 소스 71개 + Upvote + 이슈 상세 + Supabase + 177 tests.
다음 우선순위: 도메인 구매 → 상세는 `docs/roadmap.md` 참조.
