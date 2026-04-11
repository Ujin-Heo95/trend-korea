# 소스 가이드 & 카탈로그

> 2026-04-11 현행화. 스크래퍼 추가 방법 + 현재 소스 현황 + 확장 후보
> 소스 정상화 업데이트 (arcalive, ppomppu 등 re-enable + eomisae/naver_webtoon/namuwiki 신규)

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
- `category`: community, news, portal, tech, techblog, video, video_popular, finance, music, trend, government, performance, movie, travel, sports, press, newsletter, deals, blog, sns, alert 중 선택
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

## 2. 현재 소스 현황 (120개 등록, 91개 활성)

| 카테고리 | 소스 | 수집방식 | 우선순위 | 상태 |
|----------|------|----------|----------|------|
| community | dcinside, bobaedream, theqoo, instiz, natepann, todayhumor | HTML | high | 안정 |
| community | clien, mlbpark, cook82, inven, humoruniv, ygosu, slrclub, etoland | HTML | high/medium | 안정 |
| community | fmkorea | HTML | medium | **disabled** (WASM 안티봇 완전 차단) |
| community | ruliweb, dogdrip | HTML | high/medium | 안정 |
| community | arcalive | HTML | medium | 안정 |
| community | ppomppu | RSS | high | **disabled** (핫딜 통합 → ppomppu_best/ppomppu_hot) |
| trend | namuwiki | API | medium | TrendSignalScraper 전환 (trend_keywords 기록, UI 미노출) |
| news | ddanzi, chosun, jtbc | RSS | high | 안정 |
| news | yna, hani, sbs, donga, khan, hankyung, mk, kmib | RSS | medium | 안정 |
| news | ohmynews, nocutnews, asiae, segye, bbc_korean, mbn | RSS | medium | 안정 |
| news | naver_news_ranking | HTML | medium | 안정 |
| news | google_news_kr, newsis, etnews | RSS | medium/high | 안정 |
| news | joins, kbs, mbc, ytn, daum_news, seoul 외 6개 | — | — | **disabled** (RSS 종료/영문) |
| portal | bigkinds_issues | API→trend_keywords | low | 안정 |
| portal | nate_news, zum_news | HTML→posts | medium | 안정 |
| tech | yozm, boannews, zdnet_kr, itworld_kr | RSS | medium | 안정 |
| tech | geeknews | HTML | medium | 안정 |
| techblog | naver_d2 외 5개 | RSS | low | **disabled** |
| video | youtube_sbs/ytn/mbc/kbs/jtbc_news | RSS | low | 안정 |
| video | youtube, youtube_search | API | low | **disabled** (할당량 초과) |
| finance | investing_kr, sedaily, moneytoday, edaily, bizwatch | RSS | medium | 안정 |
| music | melon_chart, bugs_chart, genie_chart, kworb_spotify_kr, kworb_youtube_kr | HTML | low | 안정 |
| books | yes24_bestseller, aladin_bestseller | HTML | low | 안정 |
| ott | flixpatrol | HTML | low | 안정 |
| trend | google_trends | RSS→trend_keywords | medium | 안정 |
| trend | wikipedia_ko | API→trend_keywords | low | 안정 |
| trend | naver_datalab | API | medium | **disabled** |
| entertainment | naver_webtoon | API | low | 안정 (starScore 기준 랭킹) |
| government | korea_press, korea_policy, korea_briefing | RSS | low | 안정 |
| government | korea_kr_press, korea_kr_policy | RSS | low | 안정 (정책브리핑) |
| performance | kopis_boxoffice, kcisa_cca_performance, kcisa_cca_exhibition, seoul_cultural_event | API | low | 안정 |
| movie | kobis_boxoffice | API | low | 안정 |
| travel | traveltimes | RSS | low | 안정 |
| travel | tour_visitor, tour_festival, seoul_citydata | API | low | 안정 |
| press | newswire | RSS | medium | 안정 |
| newsletter | uppity | RSS | low | 안정 |
| deals | ppomppu_hot | RSS | medium | 안정 |
| deals | clien_jirum, quasarzone_deal | HTML | medium | 안정 |
| deals | ppomppu_best | HTML | high | 안정 |
| deals | ruliweb_hot | RSS | medium | 안정 |
| deals | eomisae | HTML | medium | 안정 (어미새 인기정보) |
| sns | apify_instagram, apify_x, apify_tiktok | Apify | medium | **disabled** |
| alert | airkorea | API | low | 안정 (sr≈0.79) |

---

## 2-1. 소스별 수집 필드 현황

> ✓=수집중, ✗=미수집, —=해당없음, *=의미변환(변화율 등)

### HTML 커뮤니티

| 소스 | title | url | thumbnail | author | viewCount | commentCount | likeCount | publishedAt |
|------|:-----:|:---:|:---------:|:------:|:---------:|:------------:|:---------:|:-----------:|
| dcinside | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ | ✓ | ✗ |
| bobaedream | ✓ | ✓ | ✗ | ✓ | ✓ | ✓ | ✓ | ✗ |
| theqoo | ✓ | ✓ | ✗ | ✗ | ✓ | ✓ | ✓ | ✗ |
| instiz | ✓ | ✓ | ✗ | ✗ | ✓ | ✓ | ✓ | ✗ |
| natepann | ✓ | ✓ | ✗ | ✗ | ✓ | ✓ | ✓ | ✗ |
| todayhumor | ✓ | ✓ | ✗ | ✗ | ✓ | ✓ | ✓ | ✗ |
| clien | ✓ | ✓ | ✓ | ✗ | ✓ | ✗ | ✓ | ✗ |
| fmkorea | ✓ | ✓ | ✓ | ✗ | ✗ | ✓ | ✓ | ✗ |
| ruliweb | ✓ | ✓ | ✗ | ✓ | ✓ | ✓ | ✓ | ✗ |
| mlbpark | ✓ | ✓ | ✗ | ✓ | ✓ | ✓ | ✓ | ✗ |
| cook82 | ✓ | ✓ | ✗ | ✓ | ✓ | ✓ | ✗ | ✗ |
| inven | ✓ | ✓ | ✗ | ✓ | ✓ | ✓ | ✓ | ✗ |
| humoruniv | ✓ | ✓ | ✓ | ✗ | ✗ | ✓ | ✗ | ✗ |
| ygosu | ✓ | ✓ | ✗ | ✓ | ✓ | ✓ | ✓ | ✗ |
| slrclub | ✓ | ✓ | ✗ | ✓ | ✓ | ✓ | ✓ | ✗ |
| etoland | ✓ | ✓ | ✗ | ✓ | ✓ | ✓ | ✓ | ✗ |
| dogdrip | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ | ✗ |
| geeknews | ✓ | ✓ | ✗ | ✓ | ✗ | ✓ | ✓ | ✗ |
| melon_chart | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| naver_news_ranking | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |

### HTML 핫딜

| 소스 | title | url | thumbnail | author | viewCount | commentCount | likeCount | publishedAt |
|------|:-----:|:---:|:---------:|:------:|:---------:|:------------:|:---------:|:-----------:|
| clien_jirum | ✓ | ✓ | ✓ | ✗ | ✓ | ✗ | ✓ | ✗ |
| quasarzone_deal | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ | ✗ | ✗ |
| ppomppu_best | ✓ | ✓ | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ |
| eomisae | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ | ✓ | ✗ |

### API 스크래퍼

| 소스 | title | url | thumbnail | author | viewCount | commentCount | likeCount | publishedAt | metadata |
|------|:-----:|:---:|:---------:|:------:|:---------:|:------------:|:---------:|:-----------:|:--------:|
| youtube | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ |
| youtube_search | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✓ | ✓ |
| kobis_boxoffice | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ |
| kopis_boxoffice | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ |
| kcisa_performance | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✓ | ✓ |
| nate_news | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✓ |
| zum_news | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✓ |
| google_trends | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✓ |
| tour_festival | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✓ | ✓ |
| tour_visitor | ✓ | ✓ | ✗ | ✗ | ✓* | ✓* | ✗ | ✓ | ✓ |
| naver_webtoon | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✓* | ✗ | ✓ |
| namuwiki | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ |
| seoul_citydata | ✓ | ✓ | ✗ | ✗ | ✓* | ✗ | ✗ | ✗ | ✓ |
| bigkinds | ✓ | ✓ | ✗ | ✗ | ✓ | ✗ | ✗ | ✓ | ✓ |
| airkorea | ✓ | ✓ | ✗ | ✗ | ✓* | ✗ | ✗ | ✗ | ✓ |

### Apify SNS

| 소스 | title | url | thumbnail | author | viewCount | commentCount | likeCount | publishedAt | metadata |
|------|:-----:|:---:|:---------:|:------:|:---------:|:------------:|:---------:|:-----------:|:--------:|
| apify_x | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓(retweets) |
| apify_instagram | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓(likes) |
| apify_tiktok | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓(shares) |

### RSS 소스 (47+개)

| 유형 | title | url | thumbnail | author | viewCount | commentCount | likeCount | publishedAt |
|------|:-----:|:---:|:---------:|:------:|:---------:|:------------:|:---------:|:-----------:|
| 일반 뉴스 RSS | ✓ | ✓ | ✓ | 일부 | ✗ | ✗ | ✗ | ✓ |
| YouTube RSS | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✓ |
| Google Trends RSS | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✓ |

> RSS thumbnail은 `enclosure`, `media:content`, `media:thumbnail` 태그에서 추출. 피드에 따라 미제공 가능.

---

## 3. 실패/제외 소스

| 사유 | 소스 |
|------|------|
| RSS 서비스 종료/404 | 중앙일보, KBS, MBC, YTN, 다음뉴스, 서울신문, 이데일리, 파이낸셜뉴스, 헤럴드경제, 블로터, IT조선, 디지털데일리, 바이라인네트워크, 쿨엔조이, 우아한형제들 |
| ToS/접근 차단 | 블라인드, Signal.bz |
| 갤러리 폐쇄 | DC인사이드 핫딜갤러리 (매니저 요청으로 영구 폐쇄) |
| 서비스 종료 | 업비트 시세, KRX 시장 (활용도 낮음), 관광사진 (tour_photo), 기상청 RSS (kma) |
| API 폐지/중단 | Naver DataLab 실검, KakaoView, KCISA 3개 (업데이트 중단) |
| 전환 완료 | Clien RSS→HTML, GeekNews RSS→HTML, Google Trends JSON→RSS |

---

## 4. 확장 후보 (미연동)

| 난이도 | 소스 |
|--------|------|
| API 키 필요 | 빗썸, 한국은행 ECOS, DART |
| API/RSS (정부) | 긴급재난문자 API (data.go.kr), 기상청 API허브 (apihub.kma.go.kr) |
| 고급/유료 | X/Twitter, 쿠팡, 무신사, Netflix Korea, CGV |

---

## 5. 추가하지 않을 소스

네이버 뉴스/카페 직접 크롤링, 인스타그램, 틱톡, 카카오톡 채널, 쿠팡/G마켓, 블라인드, 뉴닉/캐릿

> 상세 feedUrl, API 엔드포인트 등은 `git show HEAD:docs/dev/소스-확장-가이드.md`로 과거 버전 확인 가능
