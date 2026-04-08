# 데이터 품질 전수조사 리포트

> 조사일: 2026-04-06 | 대상: 95개 활성 소스 | 진단 스크립트: `backend/src/scripts/data-quality-audit.ts`

## 요약

| 등급 | 소스 수 | 비율 |
|------|---------|------|
| CRITICAL | 44 | 46% |
| WARN | 50 | 53% |
| OK | 1 | 1% |

**CRITICAL 대부분은 과거 마이그레이션 미적용 에러의 잔여 기록** (`like_count` 칼럼). 현재는 해소됨.
실제 수정이 필요한 문제는 아래 6개 카테고리.

---

## 1. [CRITICAL] nocutnews 미래일자 (625/678건, 92%)

**현상**: published_at이 2026-06-04 (2개월 미래)로 저장됨.

**근본 원인**: 노컷뉴스 RSS 피드가 비표준 날짜 형식 사용.
```
피드:   Mon, 06 04 2026 21:51:49 +0900   (숫자 월 "04")
표준:   Mon, 06 Apr 2026 21:51:49 +0900   (영문 약어 "Apr")
```
`new Date()`가 `06`을 6월로 해석하여 4월 6일 → 6월 4일로 변환.

**영향**: 스코어링에서 ageMinutes가 음수 → 현재는 `>= 0` 클램프로 점수 폭발은 방지되지만, 잘못된 날짜가 DB에 저장됨.

**파일**: `backend/src/scrapers/rss.ts` — `safeDate()` 함수 (line 64-68)

**수정안**: `safeDate()`에 미래일자 클램프 추가 — `now + 1h` 초과 시 `null` 반환.

---

## 2. [CRITICAL] parseKoreanDate KST/UTC 오프셋 (mlbpark 17건, slrclub 4건, ruliweb 3건)

**현상**: 한국 커뮤니티의 저녁 게시물이 미래일자로 잡힘.

**근본 원인**: `parseKoreanDate()`가 시간만 표시된 게시물 ("22:30")을 서버 시간(UTC) 기준으로 파싱. Railway 서버는 UTC이므로 KST 22:30 → UTC 22:30 = KST 07:30 다음날 → 9시간 미래.

**파일**: `backend/src/scrapers/http-utils.ts` (lines 123-129) — time-only 패턴

**수정안**: time-only 패턴에서 KST 오프셋(-9h) 적용, 또는 `ref`를 KST 기준으로 생성.

---

## 3. [CRITICAL] 사망 소스 11개 (enabled인데 DB 0건)

### 원인별 분류

| 원인 | 소스 | 누락 환경변수 |
|------|------|---------------|
| API 키 미설정 (throw) | bigkinds_issues | `BIGKINDS_API_KEY` |
| API 키 미설정 (silent `[]`) | airkorea, tour_visitor, tour_photo | `DATA_GO_KR_API_KEY` |
| API 키 미설정 (silent `[]`) | kcisa_cca_performance, kcisa_cca_exhibition | `KCISA_PERFORMANCE_API_KEY`, `KCISA_EXHIBITION_API_KEY` |
| API 키 미설정 (silent `[]`) | seoul_citydata, seoul_cultural_event | `SEOUL_OPEN_API_KEY` |
| HTML 구조 변경 | kworb_youtube_kr | URL 충돌 (fallback URL 중복) |

**설계 문제**: API 키 없을 때 `return []` (무음 실패) → 모니터링에서 "성공 0건"으로 보임. bigkinds_issues만 throw하여 에러 감지 가능.

**수정안**:
1. Railway에 누락 환경변수 설정, 또는 키 없는 소스는 `enabled: false`로 명시
2. API 키 미설정 시 `throw` 통일 (또는 최소 warning 로그)
3. kworb_youtube_kr: fallback URL 제거 또는 videoId 없으면 skip

---

## 4. [WARN] published_at NULL 비율 높은 소스

### HTML 스크래퍼 (날짜 파싱 미구현 또는 불완전)

| 소스 | NULL % | 비고 |
|------|--------|------|
| natepann | 100% | 날짜 미파싱 |
| todayhumor | 100% | 날짜 미파싱 |
| ygosu | 100% | 날짜 미파싱 |
| dogdrip | 100% | 날짜 미파싱 |
| etoland | 100% | 날짜 미파싱 |
| inven | 100% | 날짜 미파싱 |
| geeknews | 100% | 날짜 미파싱 |
| fmkorea | 100% | 날짜 미파싱 + 430 차단 |
| naver_news_ranking | 100% | 날짜 미파싱 |
| quasarzone_deal | 100% | 날짜 미파싱 |
| natepann_ranking | 100% | 날짜 미파싱 |
| instiz | 70% | 부분 파싱 |
| slrclub | 65% | 부분 파싱 |
| clien | 63% | 부분 파싱 |
| dcinside | 62% | 부분 파싱 |
| theqoo | 60% | 부분 파싱 |
| mlbpark | 58% | 부분 파싱 |

### RSS 소스 (피드가 날짜 미제공)

| 소스 | NULL % |
|------|--------|
| hani, khan | 100% |
| boannews, yozm, nature | 100% |
| ddanzi | 59% (NaN 날짜 파싱 실패) |

**영향**: published_at NULL이면 스코어링에서 scraped_at을 대체 사용. 정확한 시간순 정렬 불가.

**우선순위**: 커뮤니티 소스의 부분 파싱(50~70%)은 시간만 표시된 게시물이 원인 — KST 이슈 수정 시 함께 개선됨. 100% NULL 소스는 별도 파싱 로직 필요.

---

## 5. [WARN] 썸네일 URL 비정상

| 소스 | 건수 | 원인 |
|------|------|------|
| humoruniv | 106건 | `//timg.humoruniv.com/...` (프로토콜 상대 URL) |
| genie_chart | 60건 (전체) | `//image.genie.co.kr/...` (프로토콜 상대 URL) |
| aladin | 10건 | `//image.aladin.co.kr/...` (프로토콜 상대 URL) |

**수정안**: 각 스크래퍼에서 `//`로 시작하는 썸네일에 `https:` 접두어 추가. 또는 `BaseScraper`에서 일괄 처리.

---

## 6. [WARN] bizwatch URL 공백/개행 포함

**현상**: 39개 전체 URL이 `\n        http://...` 형태 (선행 공백+개행).

**근본 원인**: RSS 피드의 `<link>` 태그 내용에 공백/개행이 포함되어 있고, rss-parser가 trim하지 않음.

**파일**: `backend/src/scrapers/rss.ts` — URL 매핑 시 `.trim()` 누락

**수정안**: `rss.ts`에서 `item.link`에 `.trim()` 적용.

---

## 기타 참고사항

### 과거 에러 (이미 해소)
- `like_count 칼럼 없음`: 마이그레이션 027 적용 완료 (4/4). scraper_runs 7일 TTL로 과거 기록 잔존.
- `trend_keywords 릴레이션 없음`: 마이그레이션 035 적용 완료 (4/5).

### 정상 범위 항목
- **bobaedream 3자 미만 제목 6건**: "K4", "비가" 등 실제 짧은 게시물 (정상)
- **theqoo 조회수 3500만**: 실제 인기 게시물 (정상)
- **RSS 소스 engagement 전부 0**: RSS 피드에 조회수 미포함 (정상)
- **차트류(melon/bugs/genie/kworb) engagement 0, published_at NULL**: 차트 특성상 정상

### 간헐적 차단
- **fmkorea**: 430 상태코드 (성공률 15.5%) — 헤더 강화 필요
- **YouTube RSS**: SBS/YTN/JTBC 404 (성공률 43%) — 채널 ID 재확인 필요
- **YouTube API**: 403 쿼터 초과 (성공률 82.4%) — 쿼터 관리

---

## 수정 우선순위

| 순위 | 항목 | 영향도 | 난이도 |
|------|------|--------|--------|
| 1 | `safeDate()` 미래일자 클램프 | nocutnews 625건 잘못된 날짜 | 낮음 |
| 2 | `parseKoreanDate` KST 오프셋 | 커뮤니티 미래일자 + NULL 50~70% 개선 | 중간 |
| 3 | bizwatch URL trim | 39건 잘못된 URL | 낮음 |
| 4 | 썸네일 프로토콜 접두어 | 176건 비정상 썸네일 | 낮음 |
| 5 | 사망 소스 정리 (disable 또는 키 설정) | 모니터링 노이즈 제거 | 낮음 |
| 6 | API 키 미설정 시 throw 통일 | 향후 무음 실패 방지 | 중간 |
| 7 | kworb_youtube_kr fallback URL 수정 | 0% 성공률 소스 복구 | 낮음 |
| 8 | ddanzi NaN 날짜 방어 | 59% NULL 개선 | 낮음 |
