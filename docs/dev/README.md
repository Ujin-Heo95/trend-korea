# 개발

## 기술 스택

| 레이어 | 기술 |
|--------|------|
| 백엔드 | Node.js 20, Fastify 5, TypeScript 5.4 |
| DB | PostgreSQL 16, pg 8.11 (Pool) |
| 스크래핑 | cheerio, rss-parser, axios, p-limit |
| 스케줄링 | node-cron (우선순위별: 10/15/30분) |
| 프론트엔드 | React 18, Vite 5, TypeScript 5.4 |
| 상태관리 | @tanstack/react-query v5 |
| 스타일링 | Tailwind CSS (CDN) |
| 테스트 | Vitest, nock, axios mock |
| 배포 | Railway (auto-deploy on master push) |

## 온보딩

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

## 프로젝트 구조

```
trend-korea/                 npm workspaces 모노레포
├── backend/
│   └── src/
│       ├── config/          환경변수 파싱
│       ├── db/              Pool, 마이그레이션, 정리
│       ├── routes/          Fastify API 라우트
│       ├── scheduler/       우선순위별 cron
│       └── scrapers/        스크래퍼 + 레지스트리
│           ├── sources.json 통합 소스 설정 (22개)
│           ├── registry.ts  JSON→인스턴스 로더
│           ├── base.ts      BaseScraper (retry, saveToDb)
│           └── rss.ts       RssScraper (범용)
└── frontend/
    └── src/
        ├── pages/           HomePage
        ├── api/             API 클라이언트
        └── components/      UI 컴포넌트
```

## 개발 컨벤션

- **스크래퍼 추가:** [스크래퍼-추가-가이드.md](스크래퍼-추가-가이드.md) 참조
- **커밋:** Conventional commits (`feat|fix|refactor|docs|test|chore: 설명`)
- **테스트:** Vitest, 80%+ 커버리지 목표
- **코드 스타일:** 불변성 우선, 작은 파일 (200-400줄), 작은 함수 (<50줄)

## 상세 문서

- [아키텍처.md](아키텍처.md) — 시스템 아키텍처, DB 스키마, API 스펙
- [변경이력.md](변경이력.md) — 버전별 변경사항
- [기술부채.md](기술부채.md) — 코드 리뷰 결과, 버그, 프론트엔드 이슈 (2026-03-29)
- [인프라-스케일링.md](인프라-스케일링.md) — DB/호스팅/캐싱/모니터링 스케일링 경로 (2026-03-29)
- [소스-확장-가이드.md](소스-확장-가이드.md) — 소스 카탈로그, 실패 아카이브, 확장 우선순위 (2026-03-29)
- [콘텐츠-랭킹.md](콘텐츠-랭킹.md) — 스코어링, 중복제거, 피드백, 일일 리포트 설계 (2026-03-29)
- [decisions/](decisions/) — 기술 의사결정 기록 (TD-001~004)
