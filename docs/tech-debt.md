# 기술 부채 — 미해결 항목

> 해결된 항목: `docs/archive/tech-debt-resolved.md`

---

## 프론트엔드 — Medium

### Google Fonts 렌더 블로킹 (P2)

`index.html` — Google Fonts `<link>`에 `display=swap` 파라미터 없음 → FOIT 가능.
수정: URL에 `&display=swap` 추가 또는 `@fontsource/inter` 자체 호스팅.

### COLORS 맵 수동 관리

`PostCard.tsx` — 30개 소스별 색상 수동 매핑. sources.json과 동기화 필요.
수정: 해시 기반 자동 색상 생성 또는 공유 상수 파일.

### CategoryTabs 접근성

`CategoryTabs.tsx` — `aria-pressed`, `role="tab"` 없음.

### TrendingSection 마크업 중복

`TrendingSection.tsx` — PostCard를 재사용하지 않고 독립 마크업.

### category null vs undefined 불일치

DB는 `category IS NULL`, 프론트엔드 타입은 `Category | undefined` → 매칭 안 됨.

---

## 백엔드 — Medium

### registry.ts 동적 import 무타입

`registry.ts` — `await import(source.module)` 결과가 `any`. ScraperClass 타입 검증 없음.

### posts.ts ILIKE 와일드카드 미이스케이프

`posts.ts` — `%${q}%`에서 `%`, `_` 와일드카드 미처리 (SQL 인젝션은 아니나 검색 정확도 문제).

### cleanup.ts 인터벌 문자열 연결

`($1 || ' days')::INTERVAL` → `$1 * INTERVAL '1 day'`이 표준.

### buildScrapers 매 주기 재생성

`runScrapersByPriority`가 매번 `buildScrapers(pool)` 호출 → 인스턴스 재생성 낭비.
수정: 초기화 시 1회 빌드, 캐시 재사용.

### sources.ts any 캐스트

`sources.ts` — `(r: any)` 캐스트. `pool.query<RowType>(...)` 제네릭 사용 권장.

---

## 테스트 커버리지 갭

| 영역 | 현재 | 목표 |
|------|------|------|
| 백엔드 단위 | ~60% | 80% |
| 백엔드 통합 | 낮음 | 핵심 경로 |
| 프론트엔드 | 0% | 70% |
| E2E | 0% | Happy path |
