# 소스 가이드 & 카탈로그

> 스크래퍼 추가 방법 + 현재 소스 현황 + 확장 후보

---

## 1. 스크래퍼 추가 가이드

### RSS 소스 추가 (코드 0줄)

`backend/src/scrapers/sources.json`에 다음 형태로 추가:

```json
{
  "key": "example",
  "name": "예시 뉴스",
  "category": "news",
  "type": "rss",
  "feedUrl": "https://example.com/rss.xml",
  "priority": "medium",
  "enabled": true
}
```

- `key`: 영문 소문자, 언더스코어 (DB source_key로 사용)
- `category`: community, news, tech, video, deals, alert 중 선택
- `priority`: high(10분), medium(15분), low(30분)
- `enabled`: false로 두면 수집 제외

추가 후 배포하면 자동으로 수집 시작.

### HTML 스크래퍼 추가 (1파일 + JSON)

1. `backend/src/scrapers/example.ts` 작성 — `BaseScraper` 상속, `fetch()` 구현
2. `sources.json`에 `"type": "html"`, `"module": "./example.js"`, `"className": "ExampleScraper"` 등록
3. `backend/tests/scrapers/example.test.ts`에 fixture HTML + nock mock으로 테스트

### API 소스 추가

HTML과 동일하나 `type: "api"` 사용. 외부 API 키가 필요하면 `config/index.ts`에 환경변수 추가.

### 체크리스트

- [ ] sources.json에 등록
- [ ] (HTML/API만) 스크래퍼 파일 작성
- [ ] (HTML/API만) 테스트 작성 + 통과
- [ ] `npx tsc --noEmit` 빌드 확인
- [ ] `npx vitest run` 전체 테스트 통과
- [ ] 대상 사이트 robots.txt + ToS 확인
- [ ] fetch() 내부에서 `catch { return [] }` 금지 → throw

### 소스 제거 정책

- 7일 연속 0 posts → disable 검토
- ToS 변경으로 스크래핑 금지 → 즉시 disable
- C&D 수신 → 즉시 disable + 법무 검토
- `sources.json`에서 `"enabled": false`로 변경 (완전 삭제보다 이력 보존)

---

## 2. 현재 소스 현황 (63개 등록, 56개 활성)

| 카테고리 | 소스 | 수집방식 | 우선순위 | 상태 |
|----------|------|----------|----------|------|
| community | dcinside, bobaedream, theqoo, instiz, natepann, todayhumor | HTML | high | 안정 |
| community | ppomppu, ddanzi | RSS | high | 안정 |
| community | clien, fmkorea | HTML | medium | fmkorea 봇 차단 (430) |
| community | mlbpark, cook82, inven, humoruniv, ygosu, slrclub, etoland | HTML | high | 안정 |
| community | ruliweb | HTML | high | **disabled** (timeout) |
| news | yna, hani, sbs, donga, khan, hankyung, mk | RSS | medium | 안정 |
| news | chosun, joins | RSS | high | 신규 (2026-03-29) |
| news | kbs, mbc, jtbc, ytn | RSS | high | 신규 방송사 (2026-03-29) |
| news | daum_news | RSS | high | 신규 포탈 (2026-03-29) |
| news | google_news_kr, koreaherald, newsis | RSS | medium | 안정 |
| news | seoul, kmib, koreatimes | RSS | medium | **disabled** (404/406/DNS) |
| tech | yozm, etnews | RSS | medium | etnews 신규 (2026-03-29) |
| tech | geeknews | RSS | medium | **disabled** (403) |
| techblog | naver_d2, kakao_tech, toss_tech | RSS | low | 신규 (2026-03-29) |
| video | youtube | API | low | 쿼터 주의 (10K/일) |
| video | youtube_sbs_news, youtube_ytn, youtube_mbc_news, youtube_kbs_news, youtube_jtbc_news | RSS | medium | 신규 YouTube 뉴스 채널 |
| finance | investing_kr, sedaily | RSS | medium | 안정 |
| finance | krx | API | low | **disabled** (세션 인증 필요) |
| trend | google_trends | RSS | medium | 안정 |
| government | korea_press, korea_policy, korea_briefing | RSS | low | 안정 |
| sports | sports_donga | RSS | medium | 신규 (2026-03-29) |
| press | newswire | RSS | medium | 신규 (2026-03-29) |
| newsletter | uppity | RSS | low | 안정 |
| deals | ppomppu_hot | RSS | medium | 안정 |
| alert | kma | RSS | low | **disabled** |
| entertainment | kopis_boxoffice | API | low | 안정 |

---

## 3. 실패/제외 소스 아카이브

| 소스 | 실패 사유 | 대체 |
|------|-----------|------|
| Naver DataLab | 실시간검색 API 2021 폐지 | Google Trends RSS |
| 블라인드 | ToS 스크래핑 금지, JS 렌더링 | -- |
| 뉴닉 | RSS 없음, Stibee SPA | 어피티 RSS |
| KRX | 세션 인증 필요로 변경 | Investing.com + 서울경제 RSS |
| Clien RSS | 장기 0 posts (RSS 중단) | HTML 전환 완료 |
| FM Korea | 서버 차단 (IP 블록) | -- |
| Google Trends JSON | JSON API 폐지 | RSS 전환 완료 |
| KakaoView | 2023 서비스 종료 | -- |

---

## 4. 확장 후보 카탈로그

### Tier 1 — RSS 즉시 추가 (코드 0줄, ~60개)

**종합 일간지**: 조선일보, 중앙일보, 한국일보, 오마이뉴스, 프레시안, 세계일보, 노컷뉴스
**방송사**: KBS, MBC, JTBC, YTN
**경제/금융**: 머니투데이, 이데일리, 파이낸셜뉴스, 헤럴드경제
**IT/테크**: 블로터, IT조선, ZDNet Korea, 보안뉴스, 디지털데일리, 바이라인네트워크
**커뮤니티**: Reddit r/korea, r/hanguk
**기업 기술블로그**: 네이버 D2, 카카오, 토스, 배민, 당근, 쿠팡, LINE, 마켓컬리, 뱅크샐러드 등 25+개
**보도자료**: 뉴스와이어 (산업별 203개 RSS 제공)

### Tier 2 — API 연동 필요 (~11개)

KOBIS 박스오피스, 업비트/빗썸 시세, 한국은행 ECOS, DART, 기상청, 에어코리아, 네이버 검색, 카카오 검색, BIG KINDS

### Tier 3 — HTML 스크래퍼 (~7개)

개드립, 아카라이브, Signal.bz, 멜론 차트, 네이버 웹툰/뉴스 랭킹, 나무위키

### Tier 4 — 고급/유료 (~7개)

X/Twitter, 쿠팡, 무신사, Netflix Korea, CGV

---

## 5. 추가하지 않을 소스

네이버 뉴스/카페 직접 크롤링, 인스타그램, 틱톡, 카카오톡 채널, 쿠팡/G마켓, 블라인드, 뉴닉/캐릿

> 상세 feedUrl, API 엔드포인트 등은 `git show HEAD:docs/dev/소스-확장-가이드.md`로 과거 버전 확인 가능
