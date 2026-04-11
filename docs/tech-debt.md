# 기술 부채 — 미해결 항목

> 해결된 항목: `docs/archive/tech-debt-resolved.md`
> 2026-04-11 현행화. 해결 완료 항목 제거.

---

## 관찰 항목

### fmkorea — WASM 봇 차단

3-전략 폴백(fetchHtml → 쿠키 바이패스+RSS → 쿠키 바이패스+HTML) 재작성 완료.
WASM 봇 차단이 강력하여 성공률 미보장. 배포 후 24h 모니터링 필요, 개선 안되면 Apify/Puppeteer 전환 또는 disable.

### YouTube RSS 레이트 리밋

4개 뉴스 채널 sr 55-61%. priority low(30분)로 완화했으나 추가 개선 불가.
허용 가능 수준으로 판단.

### airkorea — data.go.kr 간헐적 500

sr ~79%. data.go.kr API의 구조적 한계. 현상 유지.

---

## 미완료 개선 항목 (2026-04-11 종합 개선에서 이월)

### FE-8: 주요 경로 프리렌더링 [L]

SPA의 크롤러 한계 해결. react-helmet-async + JSON-LD는 적용 완료 (FE-6, FE-7).
남은 작업: vite-plugin-ssr 또는 Puppeteer 기반 prerender 스크립트로 `/`, `/about`, `/privacy` 등 정적 HTML 생성.
**의존**: FE-6(완료), FE-7(완료). **파일**: `frontend/vite.config.ts` + 신규 prerender 스크립트.

### BE-13: 스코어링/Dedup 통합 테스트 [L]

핵심 비즈니스 로직(스코어링, 중복제거, 이슈 어그리게이션)에 테스트 0건.
고정 입력 → 예상 순위 검증, 동시성 레이스 컨디션 회귀 테스트.
Vitest + 테스트 DB (pg-mem 또는 Docker PG).
**파일**: 신규 `backend/tests/services/scoring.test.ts`, `dedup.test.ts`, `issueAggregator.test.ts`.

### PostCard 테스트 수정 필요

`frontend/src/__tests__/PostCard.test.tsx`의 7건 테스트 실패 — PostCard 컴포넌트 변경 후 테스트 미업데이트.
href 기대값(`/issue/42` vs 실제 `https://example.com/post/1`) 불일치.
