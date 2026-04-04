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
- `category`: community, news, tech, techblog, video, video_popular, finance, music, trend, government, performance, movie, travel, sports, press, newsletter, deals, blog, sns, alert 중 선택
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

## 2. 현재 소스 현황 (97개 등록, 84개 활성)

| 카테고리 | 소스 | 수집방식 | 우선순위 | 상태 |
|----------|------|----------|----------|------|
| community | dcinside, bobaedream, theqoo, instiz, natepann, todayhumor | HTML | high | 안정 |
| community | ppomppu, ddanzi | RSS | high | 안정 |
| community | clien, fmkorea | HTML | medium | fmkorea 봇 차단 (430) |
| community | mlbpark, cook82, inven, humoruniv, ygosu, slrclub, etoland | HTML | high | 안정 |
| community | ruliweb | HTML | high | **disabled** (timeout) |
| community | reddit_korea, reddit_hanguk | RSS (Atom) | low | 신규 (2026-04-04) |
| news | yna, hani, sbs, donga, khan, hankyung, mk, kmib | RSS | medium | 안정 |
| news | chosun, jtbc | RSS | high | 안정 |
| news | ohmynews, nocutnews, asiae, segye, bbc_korean, mbn | RSS | medium | nocutnews+ 신규 (2026-04-04) |
| news | cnn | RSS | low | 신규 (2026-04-04) |
| news | naver_news_ranking | HTML (euc-kr) | medium | 신규 (2026-04-04) |
| news | google_news_kr, koreaherald, koreatimes, newsis | RSS | medium | 안정 |
| news | joins, kbs, mbc, ytn, daum_news, seoul | RSS | high | **disabled** (RSS 서비스 종료/404) |
| tech | yozm, etnews | RSS | medium | 안정 |
| tech | boannews | RSS (euc-kr) | medium | 신규 (2026-04-04) |
| tech | zdnet_kr, itworld_kr | RSS | medium | 신규 (2026-04-04) |
| tech | nature | RSS | low | 신규 (2026-04-04) |
| tech | geeknews | RSS | medium | **disabled** (403) |
| techblog | naver_d2, kakao_tech, toss_tech | RSS | low | 안정 |
| techblog | daangn_tech, line_tech, banksalad_tech | RSS | low | 신규 (2026-04-04) |
| video | youtube | API | low | 쿼터 주의 (10K/일) |
| video | youtube_sbs_news, youtube_ytn, youtube_mbc_news, youtube_kbs_news, youtube_jtbc_news | RSS | medium | 안정 |
| finance | investing_kr, sedaily, moneytoday | RSS | medium | moneytoday 신규 (2026-04-04) |
| finance | edaily, bizwatch | RSS | medium | 신규 (2026-04-04) |
| finance | upbit | API | low | 신규 (2026-04-04), 키 불필요 |
| finance | krx | API | low | **disabled** (세션 인증 필요) |
| music | melon_chart | HTML | low | 신규 (2026-04-04) |
| trend | google_trends | RSS | medium | 안정 |
| trend | naver_datalab | API | medium | 안정 |
| government | korea_press, korea_policy, korea_briefing | RSS | low | 안정 |
| performance | kopis_boxoffice, kcisa_performance | API | low | 안정 |
| movie | kobis_boxoffice | API | low | 안정 |
| travel | tour_festival, tour_visitor | API | low | 안정 |
| sports | sports_donga | RSS | medium | **disabled** (빈 응답) |
| press | newswire | RSS | medium | 안정 |
| newsletter | uppity | RSS | low | 안정 |
| deals | ppomppu_hot | RSS | medium | 안정 |
| blog | daum_blog | API | low | 안정 |
| sns | apify_instagram, apify_x, apify_tiktok | Apify | medium | **disabled** (토큰 미설정) |
| alert | kma | RSS | low | **disabled** |

---

## 2-1. 소스별 수집 필드 현황

> ✓=수집중, ✗=미수집, —=해당없음, *=의미변환(변화율 등)

### HTML 커뮤니티

| 소스 | title | url | thumbnail | author | viewCount | commentCount | likeCount | publishedAt |
|------|:-----:|:---:|:---------:|:------:|:---------:|:------------:|:---------:|:-----------:|
| dcinside | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ | ✓ | ✗ |
| bobaedream | ✓ | ✓ | ✗ | ✓ | ✗ | ✓ | ✗ | ✗ |
| theqoo | ✓ | ✓ | ✗ | ✗ | ✓ | ✓ | ✓ | ✗ |
| instiz | ✓ | ✓ | ✗ | ✗ | ✓ | ✓ | ✓ | ✗ |
| natepann | ✓ | ✓ | ✗ | ✗ | ✓ | ✓ | ✓ | ✗ |
| todayhumor | ✓ | ✓ | ✗ | ✗ | ✓ | ✓ | ✓ | ✗ |
| clien | ✓ | ✓ | ✓ | ✗ | ✓ | ✗ | ✓ | ✗ |
| fmkorea | ✓ | ✓ | ✓ | ✗ | ✗ | ✓ | ✓ | ✗ |
| ruliweb | ✓ | ✓ | ✗ | ✓ | ✓ | ✓ | ✓ | ✗ |
| mlbpark | ✓ | ✓ | ✗ | ✗ | ✓ | ✓ | ✗ | ✗ |
| cook82 | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| inven | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| humoruniv | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| ygosu | ✓ | ✓ | ✗ | ✗ | ✗ | ✓ | ✗ | ✗ |
| slrclub | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| etoland | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| melon_chart | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| naver_news_ranking | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |

### API 스크래퍼

| 소스 | title | url | thumbnail | author | viewCount | commentCount | likeCount | publishedAt | metadata |
|------|:-----:|:---:|:---------:|:------:|:---------:|:------------:|:---------:|:-----------:|:--------:|
| youtube | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ |
| youtube_search | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✓ | ✓ |
| kobis_boxoffice | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ |
| kopis_boxoffice | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ |
| kcisa_performance | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✓ | ✓ |
| naver_datalab | ✓ | ✓ | ✗ | ✓ | ✓* | ✓* | ✗ | ✓ | ✗ |
| google_trends | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✓ |
| tour_festival | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✓ | ✓ |
| tour_visitor | ✓ | ✓ | ✗ | ✗ | ✓* | ✓* | ✗ | ✓ | ✓ |
| upbit | ✓ | ✓ | ✗ | ✗ | ✓* | ✗ | ✗ | ✗ | ✓ |
| bigkinds | ✓ | ✓ | ✗ | ✗ | ✓ | ✗ | ✗ | ✓ | ✓ |
| daum_cafe/blog | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✓ | ✓ |

### Apify SNS

| 소스 | title | url | thumbnail | author | viewCount | commentCount | likeCount | publishedAt | metadata |
|------|:-----:|:---:|:---------:|:------:|:---------:|:------------:|:---------:|:-----------:|:--------:|
| apify_x | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓(retweets) |
| apify_instagram | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓(likes) |
| apify_tiktok | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓(shares) |

### RSS 소스 (45+개)

| 유형 | title | url | thumbnail | author | viewCount | commentCount | likeCount | publishedAt |
|------|:-----:|:---:|:---------:|:------:|:---------:|:------------:|:---------:|:-----------:|
| 일반 뉴스 RSS | ✓ | ✓ | ✓ | 일부 | ✗ | ✗ | ✗ | ✓ |
| YouTube RSS | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✓ |
| Google Trends RSS | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✓ |

> RSS thumbnail은 `enclosure`, `media:content`, `media:thumbnail` 태그에서 추출. 피드에 따라 미제공 가능.

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
| 중앙일보 RSS | "서비스 종료 안내" 페이지 반환 (2026-04) | Google 뉴스 |
| KBS RSS | API 경로 변경, 404 JSON 반환 (2026-04) | YouTube RSS |
| MBC RSS | HTML 리다이렉트, RSS 아님 (2026-04) | YouTube RSS |
| YTN RSS | HTML 리다이렉트 (2026-04) | YouTube RSS |
| 다음 뉴스 RSS | HTML 리다이렉트 (2026-04) | Google 뉴스 |
| 서울신문 RSS | 404 (2026-04) | -- |
| 스포츠동아 RSS | 빈 응답 (2026-04) | -- |
| GeekNews RSS | 403 Forbidden (2026-04) | -- |
| Signal.bz | JS SPA, 헤드리스 브라우저 필요 | 네이버 뉴스 랭킹 |
| 한국일보 RSS | RSS 없음, HTML 반환 (2026-04) | Google 뉴스 |
| 프레시안 RSS | HTML 반환 (2026-04) | -- |
| 노컷뉴스 RSS | HTML 반환 (2026-04) | -- |
| 이데일리 RSS | 빈 응답 (2026-04) | 머니투데이 |
| 파이낸셜뉴스 RSS | 404 (2026-04) | 머니투데이 |
| 헤럴드경제 RSS | HTML 반환 (2026-04) | -- |
| 블로터 RSS | 404 (2026-04) | 보안뉴스 |
| IT조선 RSS | 404 (2026-04) | 전자신문 |
| ZDNet Korea RSS | 404 (2026-04) | 전자신문 |
| 디지털데일리 RSS | HTML 반환 (2026-04) | 전자신문 |
| 바이라인네트워크 RSS | 403 (2026-04) | -- |
| 우아한형제들 기술블로그 | 403 (2026-04) | 당근 기술블로그 |

---

## 4. 확장 후보 카탈로그

### Tier 1 — RSS (대부분 연동 완료, 일부 RSS 서비스 종료)

**연동 완료**: 조선일보, 오마이뉴스, 머니투데이, 보안뉴스, Reddit r/korea·r/hanguk, 네이버 D2, 카카오, 토스, 당근, LINE, 뱅크샐러드, 뉴스와이어
**RSS 서비스 종료 (추가 불가)**: 중앙일보, 한국일보, 프레시안, 세계일보, 노컷뉴스, KBS, MBC, YTN, 이데일리, 파이낸셜뉴스, 헤럴드경제, 블로터, IT조선, ZDNet Korea, 디지털데일리, 바이라인네트워크, 우아한형제들

### Tier 2 — API (대부분 연동 완료)

**연동 완료**: KOBIS, 업비트, 네이버 Datalab, 카카오(다음) 검색, BIG KINDS, KOPIS, 관광공사
**미연동 (API 키 필요)**: 빗썸, 한국은행 ECOS, DART, 에어코리아

### Tier 3 — HTML (일부 연동 완료)

**연동 완료**: 멜론 차트, 네이버 뉴스 랭킹
**JS SPA (헤드리스 필요)**: Signal.bz
**미연동 (복잡)**: 개드립, 아카라이브, 네이버 웹툰 랭킹, 나무위키

### Tier 4 — 고급/유료 (~7개)

X/Twitter, 쿠팡, 무신사, Netflix Korea, CGV

---

## 5. 추가하지 않을 소스

네이버 뉴스/카페 직접 크롤링, 인스타그램, 틱톡, 카카오톡 채널, 쿠팡/G마켓, 블라인드, 뉴닉/캐릿

> 상세 feedUrl, API 엔드포인트 등은 `git show HEAD:docs/dev/소스-확장-가이드.md`로 과거 버전 확인 가능
