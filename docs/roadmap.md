# Roadmap

목표: AdSense 수익화 + 트래픽 확보를 위한 단계적 개발.

---

## Phase 1: 소스 확장 + DB 관리 ✅ 완료 (2026-03-29)

- [x] 실패 스크래퍼 수정 (dcinside, instiz 셀렉터 갱신)
- [x] RSS→HTML 전환 (natepann, ruliweb)
- [x] 실패 RSS 제거 (clien, chosun, joins)
- [x] 신규 스크래퍼 추가 (bobaedream, todayhumor HTML)
- [x] 신규 RSS 추가 (SBS 뉴스, 동아일보)
- [x] scraper_runs TTL (SCRAPER_RUNS_TTL_DAYS=30, 자정 cron)
- [x] /api/sources 통계 강화 (success_rate_24h, avg_posts_per_run)

---

## Phase 2: SEO + 수익화

### 2-A. SEO 기초
- [ ] `frontend/index.html` — meta description, OG tags, Twitter Card
- [ ] `frontend/public/sitemap.xml` — 정적 sitemap
- [ ] `frontend/public/robots.txt`

### 2-B. Google Analytics 4
- [ ] GA4 스크립트 추가 (G-XXXXXXXXXX 발급 후)

### 2-C. Google AdSense
- [ ] AdSense 스크립트 (`ca-pub-XXXXXXXX`)
- [ ] `frontend/public/ads.txt`
- [ ] AdBanner 컴포넌트 — 목록 10개마다 인라인, 사이드바 (데스크탑)

### 2-D. 커스텀 도메인
- [ ] 도메인 구매 + Railway 연결
- [ ] HTTPS 자동 발급

---

## Phase 3: UI/UX 개선

### 3-A. 트렌딩 섹션 UI
- [ ] `/api/posts/trending` 데이터를 TrendingSection 컴포넌트로 표시

### 3-B. 카테고리 탭
- [ ] community / video / news 탭 분류

### 3-C. 검색
- [ ] `?q=` 파라미터 (posts.ts) + 검색 입력창 (HomePage)

### 3-D. 무한 스크롤
- [ ] IntersectionObserver 기반, 페이지네이션 교체

---

## Phase 4: 인프라 안정화

- [ ] Redis 캐싱 — `/api/posts` 30초 캐시 (Railway Redis)
- [ ] 이미지 프록시 — 썸네일 CORS 해결
- [ ] DB 용량 알림 — 80% 도달 시 알림
- [ ] 모니터링 대시보드 — /health 기반 Uptime 체크
