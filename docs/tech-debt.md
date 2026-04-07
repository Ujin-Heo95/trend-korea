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

### ~~감사 로그 부재 (P2-07)~~ ✅ 해결 (2026-04-04)

`server.ts` `onResponse` 훅으로 POST/PUT/DELETE 요청 구조화 JSON 로깅.
IP hash, method, path, status, admin 여부 포함.

---

## 백엔드 — Medium

### ~~`any` 타입 15+ 위치 (P2-01)~~ ✅ 해결 (2026-04-04)

`db/types.ts`에 `PostRow`, `SourceRow`, API 응답 인터페이스 정의. 16곳 `any` → 구체 타입 교체.
RSS 파서 확장 필드만 `RssExt` (eslint-disable 주석 포함) 유지.

### ~~buildScrapers 매 주기 재생성 (P2-02)~~ ✅ 해결 (2026-04-04)

모듈-레벨 캐시 + `resetScraperCache()` export. sources.json은 런타임 불변이므로 TTL 불필요.

### ~~cleanup.ts 인터벌 문자열 연결 (P2-16)~~ ✅ 해결 (2026-04-04)

`$1 * INTERVAL '1 day'` 표준화 완료.

### ~~vote 응답 로직 버그 (P2-15)~~ ✅ 해결 (2026-04-04)

`{ vote_count, is_new_vote: inserted }` 정확한 응답.

### ~~DB 연결 복구 부재 (P2-08)~~ ✅ 해결 (2026-04-04)

`db/client.ts` — `queryWithRetry()` (connection error 1회 재시도), `validateConnection()` (시작 시 3회 backoff),
`gracefulShutdown()` (5초 타임아웃 pool drain). server.ts에서 통합 호출.

### ~~category null vs undefined 불일치~~ ✅ 해결 (2026-04-04)

프론트 `Post.category` 타입을 `Category | null`로 명시. null 카테고리는 미분류 포스트로 정식 허용.

---

## 프론트엔드 — Medium

### ~~COLORS 맵 수동 관리~~ ✅ 해결 (2026-04-04)

카테고리 기반 `getSourceColor(sourceKey, category)` 함수로 전환.
신규 소스는 카테고리 기본색 자동 상속, 주요 커뮤니티만 오버라이드.
PostCard, IssueDetailPage, KeywordDetailPage, SourceFilterChips, TrendingSection 모두 적용.

### ~~CategoryTabs 접근성 (P2-12)~~ ✅ 해결 (2026-04-04)

`CategoryTabs.tsx` — `role="tablist"`, `role="tab"`, `aria-selected`, `aria-controls` 적용.
`MobileBottomNav.tsx` — `aria-current="page"` 적용.
PostCard 클러스터 버튼을 Link 밖으로 이동 + `aria-expanded` 추가.
`index.html` — skip-to-content 링크 추가. `Layout.tsx` — `main` 랜드마크에 `id="main-content"` 추가.

### ~~Google Fonts display=swap~~ ✅ 이미 적용됨

`index.html:19` 확인: `&display=swap` 파라미터 포함. 기존 tech-debt에서 제거.
단, 외부 Google Fonts 요청 자체가 렌더 블로킹 → P2-10에서 자체 호스팅으로 해결.

### ~~TrendingSection 소스 색상 미적용~~ ✅ 해결 (2026-04-04)

`getSourceColor()` 적용으로 소스 이름에 카테고리 색상 배지 표시.
레이아웃 통합은 하지 않음 — 수평 컴팩트 카드는 의도적으로 다른 디자인.

---

## 테스트 커버리지 — 진행 중

### ~~백엔드 단위 (P2-13)~~ ✅ 대폭 개선 (2026-04-04)

250 tests (35 files). 기존 208 → 250: weather, news-classifier, db/client-utils, posts.test.ts 수정.
posts.test.ts 2건 실패도 해결 (test DB 스키마 like_count 컬럼 추가).

### ~~프론트엔드 테스트 (P2-14)~~ ✅ 인프라 구축 + 초기 테스트 (2026-04-04)

vitest + @testing-library/react + jsdom 인프라 구축.
45 tests (4 files): sourceColors, PostCard, CategoryTabs, TrendingSection.

### ~~E2E (P4-06)~~ ✅ 기반 구축 (2026-04-04)

Playwright 설치 + 5건 happy path 작성 (`e2e/happy-paths.spec.ts`).
홈로드, 카테고리전환, 이슈상세, 투표, 일일리포트. CI 연동은 추후.

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

---

## 스크래퍼 품질 — 2026-04-07 진단·수정

### ~~fmkorea/ruliweb/dogdrip 봇 차단 (sr < 5%)~~ ✅ 수정 (2026-04-07)

- **fmkorea**: 3-전략 폴백 재작성 (fetchHtml → 쿠키 바이패스+RSS → 쿠키 바이패스+HTML). WASM 봇 차단 대응, 성공률 미보장 — 모니터링 필요.
- **ruliweb**: Sec-Fetch-* 풀 헤더 + 딜레이 1.5-3초. curl 200 확인.
- **dogdrip**: Sec-Fetch-* 헤더 + 셀렉터 수정 (좋아요/날짜). Cloudflare 대응, curl 200 확인.

### ~~etoland 간헐적 실패 (sr 54%)~~ ✅ 개선 (2026-04-07)

Sec-Fetch 헤더 + 딜레이 1.5-3초 추가.

### ~~kworb_youtube_kr 수집 0건~~ ✅ 해결 (2026-04-07)

raw `axios.get()` → `fetchHtml()` 전환. User-Agent/브라우저 헤더 정상화.

### ~~youtube_sbs_news 잘못된 채널 ID~~ ✅ 해결 (2026-04-07)

SBS Australia(`UCuuTCoo...`) → SBS Korea(`UCkinYTS9IHq...`) 수정.

### ~~RSS 파서 타임아웃 부족 (korea.kr 50% 실패)~~ ✅ 해결 (2026-04-07)

10초→20초 전역 증가. korea.kr 대용량 피드(300-651KB) 대응.

### ~~YouTube API 할당량 초과~~ 비활성화 (2026-04-07)

`youtube`, `youtube_search` disabled. 공유 키로 일 14K+ 유닛 소비 vs 10K 한도. YouTube RSS 뉴스 채널로 대체.

### 남은 관찰 항목

- **fmkorea**: WASM 봇 차단 강력 — 배포 후 24h 모니터링 필요, 개선 안되면 Apify/Puppeteer 전환 또는 disable.
- **YouTube RSS 레이트 리밋**: 4개 뉴스 채널 sr 55-61%. priority low(30분)로 완화했으나 추가 개선 불가 — 허용 가능 수준.
- **airkorea**: sr 79%, data.go.kr 간헐적 500 — 구조적 한계, 현상 유지.
