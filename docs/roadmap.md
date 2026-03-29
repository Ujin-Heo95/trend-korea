# Roadmap

목표: 공개된 실시간 고가치 정보를 효율적으로 수집·제공하는 어그리게이터.

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

## Scale-Up Phase 1: 수집 인프라 기반 ✅ 완료 (2026-03-29)

- [x] p-limit(4) 동시성 제어 (Promise.allSettled 무제한 병렬 → 4개 제한)
- [x] BaseScraper retry 2회 + 지수 백오프 (2초, 8초)
- [x] DB 풀 튜닝 (DB_POOL_MAX, 타임아웃 설정)
- [x] category 컬럼 추가 (posts 테이블 + 마이그레이션 003)

---

## Scale-Up Phase 2: 레지스트리 + RSS 확장

- [ ] sources.json 통합 레지스트리 (소스 추가 = JSON 6줄)
- [ ] registry.ts 로더 (RSS 자동 생성, HTML/API 동적 import)
- [ ] RSS 9개 추가 (경향/한경/매경/서울/국민/GeekNews/요즘IT/기상청/뽐뿌핫딜)
- [ ] 우선순위별 스케줄링 (high=10분, medium=15분, low=30분)

→ 13개 → 22개 소스

---

## Scale-Up Phase 3: API 소스

- [ ] Naver DataLab (실시간 검색 트렌드)
- [ ] KRX 시장 데이터 (일일 등락 상위)
- [ ] 공공데이터포털 (정부 공지)

---

## Scale-Up Phase 4: 선별 확장

- [ ] 블라인드 (직장인 트렌딩)
- [ ] 뉴스레터 (뉴닉/어피티 — RSS/아카이브 우선 확인)

---

## Frontend Phase: SEO + 수익화

- [ ] SEO (meta, OG tags, sitemap, robots.txt)
- [ ] GA4 연동
- [ ] AdSense (ads.txt, AdBanner 컴포넌트)
- [ ] 커스텀 도메인

---

## Frontend Phase: UI/UX

- [ ] 트렌딩 섹션 UI
- [ ] 카테고리 탭 (community/video/news/tech/finance)
- [ ] 검색 (`?q=`, `?category=`)
- [ ] 무한 스크롤

---

## 인프라 안정화 (장기)

- [ ] Redis 캐싱
- [ ] 이미지 프록시
- [ ] DB 용량 알림
- [ ] 모니터링 대시보드
