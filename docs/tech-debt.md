# 기술 부채 — 미해결 항목

> 해결된 항목: `docs/archive/tech-debt-resolved.md`
> 2026-04-03 제로베이스 코드 분석으로 전면 재작성.

---

## 보안 — High

### ~~Security Headers 부재 (P1-05)~~ ✅ 해결 (2026-04-04)

`@fastify/helmet` 등록. CSP + HSTS + X-Frame-Options. AdSense 도메인 허용.

### ~~dedup.ts SQL 템플릿 리터럴 (P2-03)~~ ✅ 해결 (2026-04-04)

`$1 * INTERVAL '1 hour'` 파라미터화 완료.

### ~~ADMIN_TOKEN 미설정 시 어드민 노출 (P2-04)~~ ✅ 해결 (2026-04-04)

프로덕션 환경에서 토큰 미설정 시 어드민 접근 거부 + 기동 경고.

### ~~입력 새니타이즈 미적용 (P2-06)~~ ✅ 해결 (2026-04-04)

`BaseScraper.saveToDb()`에서 HTML strip + 제어문자 제거 + 길이 제한 + metadata 크기 바운드.

### 감사 로그 부재 (P2-07)

POST/PUT/DELETE 요청에 대한 기록 없음. 투표 조작, 리포트 생성 트리거 등 추적 불가.
수정: `onRequest` 훅 → 구조화 stdout (IP hash, method, path, admin status).

---

## 백엔드 — Medium

### `any` 타입 15+ 위치 (P2-01)

| 파일 | 위치 | 내용 |
|------|------|------|
| `routes/posts.ts` | 라인 7, 100, 154, 209, 227 | 쿼리 결과 `any[]` 캐스트 |
| `routes/sources.ts` | 라인 23-24 | `(r: any)` 캐스트 |
| `scrapers/registry.ts` | 동적 import | `await import()` 결과 무타입 |
| `scrapers/rss.ts` | 라인 97, 103, 122 | RSS 아이템 타입 미정의 |
| `services/weather.ts` | 라인 130 | KMA API 응답 무타입 |
| `scrapers/apify-x.ts` | 라인 36 | media 객체 무타입 |
| `scrapers/daum-search.ts` | 라인 81 | API 응답 무타입 |
| `scrapers/youtube*.ts` | 다수 | API 응답 무타입 |

모델: `issueDetail.ts`가 모든 쿼리를 정확히 타입화한 좋은 예시.

### buildScrapers 매 주기 재생성 (P2-02)

`scrapers/index.ts` — `runScrapersByPriority`, `runApifyScrapers`, `runAllScrapers`가 매번
`buildScrapers(pool)` 호출. 68개 소스에 대해 동적 import + 클래스 인스턴스화 반복.
수정: 모듈 레벨 캐시 + `resetScrapers()` export.

### ~~cleanup.ts 인터벌 문자열 연결 (P2-16)~~ ✅ 해결 (2026-04-04)

`$1 * INTERVAL '1 day'` 표준화 완료.

### ~~vote 응답 로직 버그 (P2-15)~~ ✅ 해결 (2026-04-04)

`{ vote_count, is_new_vote: inserted }` 정확한 응답.

### DB 연결 복구 부재 (P2-08)

`db/client.ts` — pool error 시 console.log만. Supabase 유지보수 시 연결 끊기면
프로세스 재시작까지 모든 쿼리 실패.
수정: 재연결 backoff + 스크래퍼 일시정지 + health 503.

### category null vs undefined 불일치

DB는 `category IS NULL`, 프론트엔드 타입은 `Category | undefined`. 경계에서 매칭 안 됨.

---

## 프론트엔드 — Medium

### COLORS 맵 수동 관리

`sourceColors.ts` + `PostCard.tsx` — 50개+ 소스별 색상 수동 매핑.
sources.json과 동기화 필요. 해시 기반 자동 색상 생성 또는 sources.json에 색상 필드 추가 권장.

### CategoryTabs 접근성 (P2-12)

`CategoryTabs.tsx` — `role="tab"`, `aria-selected`, `aria-controls` 미적용.
`MobileBottomNav.tsx` — `aria-current="page"` 미적용.
PostCard 내 중첩 인터랙티브 요소 (Link 안에 클러스터 확장 버튼).
skip-to-content 링크 없음.

### ~~Google Fonts display=swap~~ ✅ 이미 적용됨

`index.html:19` 확인: `&display=swap` 파라미터 포함. 기존 tech-debt에서 제거.
단, 외부 Google Fonts 요청 자체가 렌더 블로킹 → P2-10에서 자체 호스팅으로 해결.

### TrendingSection 마크업 중복

`TrendingSection.tsx` — PostCard를 재사용하지 않고 독립 마크업 사용.

---

## 테스트 커버리지 갭 — High

| 영역 | 현재 | 목표 | 로드맵 |
|------|------|------|--------|
| 백엔드 단위 | ~60% (181 tests) | 80% | P2-13 |
| 백엔드 통합 | 0% | 핵심 경로 5-8건 | P2-13 |
| 프론트엔드 | 0% | 40% (hooks+컴포넌트) | P2-14 |
| E2E | 0% | Happy path 5건 | P4-06 |

---

## SEO — High

> 도메인 weeklit.net 구매+연결 완료. SEO 기술 작업 착수 가능.

### ~~SPA 렌더링 한계 (P1-01)~~ ✅ 해결 (2026-04-04)

봇 UA 감지 프리렌더 미들웨어 구현. 동적 title/meta/OG/canonical 반환.

### ~~정적 canonical (P1-01)~~ ✅ 해결 (2026-04-04)

프리렌더에서 페이지별 동적 canonical URL 설정.

### ~~정적 sitemap (P1-02)~~ ✅ 해결 (2026-04-04)

`/sitemap.xml` 동적 엔드포인트. 이슈 500개 + 리포트 30일 포함.

### ~~구조화 데이터 부재 (P1-03)~~ ✅ 해결 (2026-04-04)

Article (이슈 상세) + WebSite SearchAction (홈) JSON-LD 삽입.
