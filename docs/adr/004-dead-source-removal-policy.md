# ADR-004: 실패 소스 제거 정책

날짜: 2026-03-29 | 상태: 적용됨

## 맥락

14개 소스 중 9개가 프로덕션에서 0 posts. 실패 소스를 계속 유지하면:
- scraper_runs에 에러 로그만 쌓여 DB 낭비
- /health 응답이 대부분 실패로 보여 모니터링 의미 퇴색
- 사용자에게 빈 소스 필터가 노출

## 결정

수정 불가능한 소스는 제거하고, 대체 소스를 추가하는 정책 채택.

**제거:** clien (RSS 중단), chosun (RSS 중단), joins (RSS 중단), fmkorea (HTML 차단)
**전환:** natepann, ruliweb, todayhumor (RSS → HTML)
**추가:** bobaedream, SBS 뉴스, 동아일보

## 결과

- (+) 14개 → 13개로 소스 수는 비슷하되 실제 수집 소스 대폭 증가
- (+) scraper_runs 에러 로그 감소
- (+) /health 모니터링 신뢰도 향상
- (-) 제거된 소스의 기존 posts는 TTL 만료까지 잔존
- 향후 정책: scraper_runs에서 7일 연속 0 posts인 소스는 제거 검토
