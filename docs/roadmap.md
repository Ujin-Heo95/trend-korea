# 로드맵

목표: 공개된 실시간 고가치 정보를 효율적으로 수집·제공하는 어그리게이터.
AdSense 수익화 + 트래픽 확보.

---

## 완료된 마일스톤

<details>
<summary>Phase 1~2: 소스 확장 + DB + UI (2026-03-29)</summary>

- **Phase 1**: 13개 소스 안정화, scraper_runs TTL, /api/sources 통계
- **Scale-Up 1~4**: p-limit 동시성, sources.json 레지스트리, Google Trends RSS, 28→51개 소스
- **프론트엔드 UI/UX**: 트렌딩 섹션, 카테고리 탭, 검색, 무한 스크롤
- **기술부채 정리**: try-catch 좀비 패턴 수정, ErrorBoundary, 이미지 lazy loading, 고장 소스 disable
- **RSS 확장**: Google News KR, Korea Herald, Korea Times, 뉴시스 등
- **영화/공연 개선**: KOBIS+KMDB 포스터, KOPIS 상세, 장르 확장, 프론트 통합

</details>

<details>
<summary>Phase 2.5~2.6: 사업 기반 + 런칭 준비 (2026-03-30)</summary>

- Umami Cloud 스크립트 삽입 (ID 교체 필요)
- Sentry 백엔드 통합 (DSN 설정 필요)
- 개인정보처리방침 + /privacy 페이지
- 서비스 소개 /about 페이지
- 공유 버튼 (카카오 + 링크복사 + Web Share API)
- PWA manifest + 서비스워커
- 카테고리 탭 15→8개 통합
- GitHub Actions CI (lint + typecheck + vitest + build)
- ESLint flat config
- 읽음 표시 (localStorage, 3일 TTL)
- 코드 스플리팅 (302KB→46KB 메인번들)
- 백엔드 테스트 커버리지 60% (181 tests)

</details>

<details>
<summary>Phase 3 부분 완료: 사용자 참여 (2026-04-02)</summary>

- 크로스소스 트렌드 감지 (Google×Naver×커뮤니티)
- 교차 검증 트렌드 UX (관련 기사, 스파크라인)
- 전체 탭 영화/공연 제외, 커뮤니티 탭 순위 동적화
- YouTube RSS 5개 추가 (SBS/YTN/MBC/KBS/JTBC)
- KMDB 포스터+줄거리 전환
- UX 개선 (검색 X버튼, ErrorRetry, 빈상태, 동적 타이틀)
- Upvote 시스템 (localStorage + IP dedup)
- 이슈 상세 페이지 (/issue/:id)
- BigKinds 일일 이슈 Top 10

</details>

<details>
<summary>P0 보안 + P1 성능·무결성 (2026-04-02)</summary>

- **P0**: API 키 로테이션, ADMIN_TOKEN, Kakao JS Key 제거, IP 스푸핑 차단, SSL 복원, CORS weeklit.net
- **P1**: schema_migrations 추적, dedup 배치 pre-fetch, LEFT JOIN 최적화, trendSignals 배치 fetch, dbMonitor 임계값, FK BIGINT, JSON Schema 검증, ILIKE 이스케이프

</details>

---

## 신규 로드맵 (2026-04-03 제로베이스 분석)

> 6개 관점 통합: 서비스기획, 백엔드, 프론트엔드, 보안, SEO, 마케팅/사업

### P0: 생존 기반 (1-2주)

모니터링·측정·법적 기반 확보. 도메인은 완료 (weeklit.net).

| ID | 작업 | 관점 | 공수 | 블로킹 |
|----|------|------|------|--------|
| ~~P0-01~~ | ~~**도메인 구매 + Cloudflare DNS**~~ | 사업 | — | ✅ **완료** (weeklit.net) |
| P0-02 | **개인사업자등록** (간이과세자, 홈택스) | 사업 | 1d | AdSense 수령, 쿠팡 파트너스 |
| ~~P0-03~~ | ~~**Umami data-website-id 교체**~~ | 마케팅 | — | ✅ **완료** (2026-04-03) |
| P0-04 | **Sentry DSN 환경변수** (Railway 설정) | 백엔드 | 30m | 에러 가시성 |
| P0-05 | **UptimeRobot /health 모니터링** | 인프라 | 30m | 가동시간 감시 + keep-alive |
| ~~P0-06~~ | ~~**절대 URL 일괄 변경**~~ | SEO | — | ✅ **완료** (이전 커밋에서 적용 확인) |
| P0-07 | **사업자정보 공시** (About/Footer에 상호·대표자·사업자번호) | 법무 | 2h | AdSense 필수, 정보통신망법 |
| P0-08 | **Google Search Console + 네이버 서치어드바이저 등록** | SEO | 1h | 검색 유입 파이프라인 |

#### 의존성
```
P0-01 (도메인) → ✅ 완료
P0-02 (사업자) → P0-07
```

---

### P1: SEO 기반 + 첫 런칭 (3-4주)

SPA의 SEO 한계를 해결하고, 첫 유저를 획득한다.

| ID | 작업 | 관점 | 공수 | 상세 |
|----|------|------|------|------|
| ~~P1-01~~ | ~~**봇 프리렌더 미들웨어**~~ | SEO | — | ✅ **완료** (2026-04-04) 봇 UA → 동적 meta/OG/canonical |
| ~~P1-02~~ | ~~**동적 sitemap.xml**~~ | SEO | — | ✅ **완료** (2026-04-04) /sitemap.xml 엔드포인트 (이슈+리포트) |
| ~~P1-03~~ | ~~**JSON-LD 구조화 데이터**~~ | SEO | — | ✅ **완료** (2026-04-04) Article + WebSite SearchAction |
| P1-04 | **OG 이미지 동적 생성** | 마케팅 | 2-3d | satori+sharp 또는 @vercel/og → /api/og-image/:postId |
| ~~P1-05~~ | ~~**Security Headers**~~ | 보안 | — | ✅ **완료** (2026-04-04) @fastify/helmet + CSP |
| P1-06 | **AdSense 신청** | 사업 | 2h | 도메인+사업자+개인정보처리방침 완료 후. 심사 2-4주 |
| P1-07 | **쿠팡 파트너스 가입** (Plan B 수익) | 사업 | 1h | 핫딜 포스트에 제휴 링크 |
| P1-08 | **Disquiet 런칭 + GeekNews 글** | 마케팅 | 5-6h | 화~수 오전 KST. 스크린샷 5장 + 기술 스택 + "네이버 실검 대안" |
| P1-09 | **네이버 블로그 SEO 포스트 3편** | 마케팅 | 4-6h | "실시간 트렌드 모아보기", "커뮤니티 인기글 한눈에", "네이버 실검 대안" |
| P1-10 | **DC개발갤 / 클리앙 사이드프로젝트 공유** | 마케팅 | 2-3h | 기술 여정 중심, 홍보 톤 최소화 |
| P1-11 | **AdSense 배치 전략** (AdSlot 컴포넌트) | 프론트 | 1-2d | PostCard 5개마다, 리포트 섹션 간, 모바일 하단 sticky |

#### 의존성
```
P0-01 (도메인) → ✅ 완료. P1 작업 블로커 해소됨
P0-02 → P1-06, P1-07
P1-01 → P1-03 (프리렌더에 JSON-LD 삽입)
```

---

### P2: 코드 품질 + 보안 강화 (5-6주)

기술부채 해소, 보안 표면 축소, 테스트 커버리지 확보.

| ID | 작업 | 관점 | 공수 | 상세 |
|----|------|------|------|------|
| P2-01 | **`any` 타입 제거** (15+ 위치) | 백엔드 | 3-5h | posts.ts, sources.ts, rss.ts, registry.ts, weather.ts, youtube*.ts 등 → `pg.query<RowType>()` |
| P2-02 | **buildScrapers 캐시** | 백엔드 | 2-3h | 매 주기 재생성 → 모듈 레벨 캐시, `resetScrapers()` export (테스트용) |
| ~~P2-03~~ | ~~**dedup.ts SQL 파라미터화**~~ | 보안 | — | ✅ **완료** (2026-04-04) |
| ~~P2-04~~ | ~~**ADMIN_TOKEN 프로덕션 필수화**~~ | 보안 | — | ✅ **완료** (2026-04-04) |
| ~~P2-05~~ | ~~**라우트별 Rate Limit 차등**~~ | 보안 | — | ✅ **완료** (2026-04-04) vote 10/min, health 제외 |
| ~~P2-06~~ | ~~**입력 새니타이즈**~~ | 보안 | — | ✅ **완료** (2026-04-04) HTML strip + 길이 제한 |
| P2-07 | **감사 로그** (mutating ops) | 보안 | 4-6h | POST/PUT/DELETE → 구조화 stdout (IP hash, path, admin status) |
| P2-08 | **DB 연결 복구 로직** | 백엔드 | 2-3h | pool error → 재연결 backoff + 스크래퍼 일시정지 + health 503 |
| P2-09 | **스켈레톤 로딩** | 프론트 | 2-3d | PostCard/IssueDetail/Report 형태별 스켈레톤. CLS 방지 |
| P2-10 | **Core Web Vitals 개선** | 프론트 | 2d | TrendHero min-height, Inter 자체 호스팅, useTransition, content-visibility |
| P2-11 | **이미지 최적화** | 프론트 | 2-3d | weserv.nl 프록시 or sharp 엔드포인트 + srcset + fetchpriority="high" |
| P2-12 | **접근성 개선** | 프론트 | 1d | CategoryTabs role=tab, skip-to-content, aria-live, MobileBottomNav aria-current |
| P2-13 | **백엔드 통합 테스트** | 테스트 | 8-12h | vote flow, posts trending+dedup, scoring batch (pg-mem or Docker PG) |
| P2-14 | **프론트엔드 테스트 시작** | 테스트 | 5-7d | Vitest+RTL: hooks 단위 → PostCard 컴포넌트 → MSW 통합. 목표 40% |
| ~~P2-15~~ | ~~**vote 응답 로직 수정**~~ | 백엔드 | — | ✅ **완료** (2026-04-04) is_new_vote |
| ~~P2-16~~ | ~~**cleanup.ts 인터벌 표준화**~~ | 백엔드 | — | ✅ **완료** (2026-04-04) |

---

### P3: 사용자 참여 + 리텐션 (7-10주)

DAU 유지를 위한 리텐션 채널 3개 확보 + 제품 차별화 강화.

| ID | 작업 | 관점 | 공수 | 상세 |
|----|------|------|------|------|
| P3-01 | **카카오톡 채널 + 일일 다이제스트** | 마케팅 | 1-2d | 08:00 KST 자동 발송, daily report API 연동 |
| P3-02 | **이메일 뉴스레터** (Stibee) | 마케팅 | 1-2d | 무료 100명, daily report 자동화, 구독 위젯 |
| P3-03 | **X/Twitter 일일 트렌드 봇** | 마케팅 | 0.5d | Top 5 키워드 + OG 이미지 카드, 매일 자동 포스팅 |
| P3-04 | **Web Push 알림** | 프론트 | 3-4d | VAPID, sw.js 확장, convergence_score 급등 시 알림 |
| P3-05 | **다크 모드** | 프론트 | 3-4d | Tailwind dark: + localStorage 토글 + prefers-color-scheme 기본 |
| P3-06 | **북마크/즐겨찾기** | 프론트 | 1-2d | localStorage → 추후 서버 동기화. /bookmarks 페이지 |
| P3-07 | **교차 검증기 재활성화** | 백엔드 | 4-6h | trendCrossValidator.ts 디버그 + API 키 확인 + trend_signals 복구 |
| P3-08 | **스크래퍼 서킷 브레이커** | 백엔드 | 4-6h | 연속 5회 실패 → 1시간 자동 스킵 + Discord 알림 |
| P3-09 | **구조화 로깅** (pino) | 백엔드 | 4-5h | console.log → fastify.log 통합, request-id 상관관계 |
| P3-10 | **DB 인덱스 최적화** | 백엔드 | 3-4h | EXPLAIN ANALYZE → 신규 마이그레이션 (post_scores, keywords GIN, engagement captured_at) |
| P3-11 | **중앙 에러 핸들러** | 백엔드 | 3-4h | setErrorHandler → 일관된 응답 형태 + Sentry 통합 |
| P3-12 | **AdSense 미승인 대응** | 사업 | 2-3h | 카카오 AdFit / 네이버 AdPost 신청, 에디토리얼 콘텐츠 비율 증가 |

---

### P4: 스케일 (11주+)

DAU 1000+ 대비 인프라 확장 + 개인화 + 사업 고도화.

| ID | 작업 | 관점 | 공수 | 상세 |
|----|------|------|------|------|
| P4-01 | **SSR 마이그레이션** (Next.js App Router) | 프론트 | 2-3w | 프리렌더 미들웨어 교체, SEO 근본 해결 |
| P4-02 | **스케줄러 워커 분리** | 백엔드 | 6-8h | web + worker 프로세스 (Railway 별도 서비스) |
| P4-03 | **API 버저닝** (/api/v1/) | 백엔드 | 4-6h | 런칭 전 적용 권장, 하위 호환 리다이렉트 |
| P4-04 | **응답 스키마 검증** | 백엔드 | 5-7h | Fastify response schema → 직렬화 최적화 + 데이터 누출 방지 |
| P4-05 | **Supavisor 커넥션 풀러** | 인프라 | 2-3h | 워커 분리 후 DB_POOL_MAX 조정 |
| P4-06 | **E2E 테스트** (Playwright) | 테스트 | 10-15h | 핵심 사용자 플로우: 홈→카테고리→이슈상세→투표→리포트 |
| P4-07 | **경량 유저 계정** (Supabase Auth) | 서비스 | 3-5d | 카카오 로그인 + localStorage 마이그레이션 |
| P4-08 | **"For You" 개인화 피드** | 서비스 | 3-5d | 읽음/투표 이력 → TF-IDF 관심 벡터 → 피드 재랭킹 |
| P4-09 | **B2B API 검토** | 사업 | TBD | 미디어 모니터링 수요 검증 후 |
| P4-10 | **Cloudflare Pages 프론트 분리** | 인프라 | 2-3h | 정적 자산 CDN, API 서브도메인 분리 |

---

## 의존성 그래프 (크리티컬 패스)

```
P0-01 (도메인) → ✅ 완료 (weeklit.net)
  ├→ P0-06 (URL) → P0-08 (검색엔진) → [SEO 유입]
  ├→ P0-03 (Umami) → [측정]
  ├→ P1-01 (프리렌더) → P1-03 (JSON-LD)
  ├→ P1-04 (OG 이미지) → P3-03 (X봇)
  ├→ P1-06 (AdSense) → P3-12 (대안)
  └→ P1-08 (런칭) → P1-10 (커뮤니티)

P0-02 (사업자) ──┬→ P0-07 (법적 공시)
                 ├→ P1-06 (AdSense)
                 └→ P1-07 (쿠팡)

P2-01 (any 제거) → P4-04 (응답 스키마)
P2-02 (캐시) → P3-08 (서킷 브레이커)
P2-13 (통합 테스트) → P4-06 (E2E)
P4-02 (워커) → P4-05 (Supavisor)
P3-06 (북마크) → P4-07 (계정) → P4-08 (For You)
```

**크리티컬 패스**: `P0-06 (URL 절대화) → P0-08 (검색엔진) + P1-08 (런칭)` (도메인 완료됨)

---

## KPI 마일스톤

| 시점 | DAU | 수익 | 핵심 지표 |
|------|-----|------|-----------|
| 2주 | 0 | $0 | 도메인 라이브, 분석 활성화 |
| 4주 | 20+ | $0 | Disquiet+GeekNews 런칭 완료 |
| 6주 | 50+ | $0-30 | 검색 인덱싱, 커뮤니티 시딩 |
| 8주 | 100+ | $30-60 | AdSense 결정, 뉴스레터 100명 |
| 12주 | 200+ | $60-120 | 카카오톡 채널, Push 알림 |
| 18주 | 500+ | $300+ | 뉴스레터 광고 가능 |
| 24주 | 1000+ | $600+ | B2B API 수요 검증 |

---

## 기각된 기술 제안

| 제안 | 판정 | 사유 |
|------|------|------|
| Next.js 즉시 마이그레이션 | 연기→P4 | 프리렌더 미들웨어로 SEO 해결 가능. 런칭이 우선 |
| BullMQ 잡 큐 | 거부 | mutex flag로 10K DAU까지 충분 |
| Redis 캐싱 | 연기 | 인메모리 LRU로 10K DAU까지 커버 |
| pg_trgm 중복제거 | 거부 | md5 해시 + 배치 TF-IDF가 INSERT 비용 낮음 |
| GA4 분석도구 | 거부 | PIPA 위반 우려 → Umami 채택 |
| 즉시 SSR | 연기→P4 | 봇 프리렌더로 충분, 런칭 지연 방지 |

---

## 상세 문서 참조

| 문서 | 내용 |
|------|------|
| [tech-debt.md](tech-debt.md) | 미해결 기술 부채 |
| [architecture.md](architecture.md) | 시스템 아키텍처 |
| [scaling.md](scaling.md) | DB/호스팅/캐싱/비용 스케일링 |
| [sources.md](sources.md) | 소스 카탈로그, 확장 우선순위 |
| [scoring.md](scoring.md) | 스코어링, 중복제거, 일일 리포트 |
| [business/financials.md](business/financials.md) | DAU별 비용·수익 모델 |
| [business/marketing.md](business/marketing.md) | SEO + 마케팅 전략 |
| [business/legal.md](business/legal.md) | 법적 검토 |
