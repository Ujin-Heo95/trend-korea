# Scale-Up Phase 3·4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 5개 신규 소스를 추가하여 22 → 27개 소스로 확장 (API 2개 + RSS 3개)

**Architecture:** 기존 `sources.json` 레지스트리 패턴 유지. RSS 소스 3개는 JSON 등록만으로 코드 0줄. API 소스 2개(KRX, Google Trends)는 `BaseScraper` 상속 커스텀 클래스 구현. 레지스트리의 `buildOneScraper`에 특수 생성자 분기 불필요 — 기존 `html/api` 타입 동적 import 패턴 사용.

**Tech Stack:** TypeScript, Fastify 5, axios, node-cron, Vitest, pg

---

## Scope Change from Original Roadmap

리서치 결과 원래 계획에서 변경:

| 원래 | 변경 | 이유 |
|------|------|------|
| Naver DataLab API | **Google Trends Korea** | 네이버 실시간검색어 API 2021년 폐지. Google Trends가 무인증으로 한국 실시간 트렌드 제공 |
| 공공데이터포털 API | **korea.kr RSS** (3개 피드) | data.go.kr는 인증 필요. korea.kr RSS는 무인증, 기존 RSS 인프라 재사용 |
| 블라인드 | **제외** | ToS에서 스크래핑 명시적 금지, JS 렌더링, robots.txt AI 크롤러 차단 |
| 뉴닉 | **제외** | RSS 없음, Stibee SPA 렌더링 |
| 어피티 | **어피티 RSS** | WordPress RSS 2.0 제공, 바로 추가 가능 |

## File Structure

### New files
- `backend/src/scrapers/krx.ts` — KRX 시장 데이터 스크래퍼
- `backend/src/scrapers/google-trends.ts` — Google Trends Korea 스크래퍼
- `backend/tests/scrapers/krx.test.ts` — KRX 스크래퍼 테스트
- `backend/tests/scrapers/google-trends.test.ts` — Google Trends 테스트
- `backend/tests/fixtures/krx-response.json` — KRX mock 응답 데이터
- `backend/tests/fixtures/google-trends-response.json` — Google Trends mock 응답 데이터

### Modified files
- `backend/src/scrapers/sources.json` — 5개 소스 엔트리 추가
- `docs/로드맵.md` — Phase 3·4 완료 체크 + 변경 사항 기록

---

## Phase 3: API 소스

### Task 1: KRX 시장 데이터 스크래퍼 — 테스트 작성

**Files:**
- Create: `backend/tests/fixtures/krx-response.json`
- Create: `backend/tests/scrapers/krx.test.ts`

- [ ] **Step 1: KRX mock 응답 fixture 생성**

```json
{
  "OutBlock_1": [
    {
      "ISU_SRT_CD": "005930",
      "ISU_ABBRV": "삼성전자",
      "TDD_CLSPRC": "72,000",
      "CMPPREVDD_PRC": "+2,500",
      "FLUC_RT": "+3.60",
      "ACC_TRDVOL": "15,234,567",
      "MKT_NM": "KOSPI"
    },
    {
      "ISU_SRT_CD": "000660",
      "ISU_ABBRV": "SK하이닉스",
      "TDD_CLSPRC": "185,000",
      "CMPPREVDD_PRC": "-3,000",
      "FLUC_RT": "-1.60",
      "ACC_TRDVOL": "5,678,901",
      "MKT_NM": "KOSPI"
    },
    {
      "ISU_SRT_CD": "035720",
      "ISU_ABBRV": "카카오",
      "TDD_CLSPRC": "55,000",
      "CMPPREVDD_PRC": "+1,000",
      "FLUC_RT": "+1.85",
      "ACC_TRDVOL": "3,456,789",
      "MKT_NM": "KOSPI"
    }
  ]
}
```

Write to `backend/tests/fixtures/krx-response.json`.

- [ ] **Step 2: KRX 스크래퍼 failing test 작성**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { KrxScraper } from '../../src/scrapers/krx.js';
import krxFixture from '../fixtures/krx-response.json';

vi.mock('axios');

const mockPool = { query: vi.fn() } as any;

describe('KrxScraper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch and return top gainers/losers as ScrapedPost[]', async () => {
    vi.mocked(axios.post).mockResolvedValueOnce({ data: krxFixture });

    const scraper = new KrxScraper(mockPool);
    const posts = await scraper.fetch();

    expect(posts.length).toBeGreaterThan(0);
    expect(posts.length).toBeLessThanOrEqual(30);
    expect(posts[0]).toMatchObject({
      sourceKey: 'krx',
      sourceName: 'KRX 시장',
      category: 'finance',
    });
    expect(posts[0].title).toContain('삼성전자');
    expect(posts[0].url).toContain('data.krx.co.kr');
  });

  it('should sort by absolute fluctuation rate descending', async () => {
    vi.mocked(axios.post).mockResolvedValueOnce({ data: krxFixture });

    const scraper = new KrxScraper(mockPool);
    const posts = await scraper.fetch();

    // 3.60% > 1.85% > 1.60% by absolute value
    expect(posts[0].title).toContain('삼성전자');
    expect(posts[0].title).toContain('+3.60%');
  });

  it('should return empty array on API error', async () => {
    vi.mocked(axios.post).mockRejectedValueOnce(new Error('network error'));

    const scraper = new KrxScraper(mockPool);
    const posts = await scraper.fetch();

    expect(posts).toEqual([]);
  });

  it('should format today date as YYYYMMDD', async () => {
    vi.mocked(axios.post).mockResolvedValueOnce({ data: krxFixture });

    const scraper = new KrxScraper(mockPool);
    await scraper.fetch();

    const call = vi.mocked(axios.post).mock.calls[0];
    const body = call[1] as string;
    // trdDd should be today in YYYYMMDD
    expect(body).toContain('trdDd=');
    expect(body).toMatch(/trdDd=\d{8}/);
  });
});
```

Write to `backend/tests/scrapers/krx.test.ts`.

- [ ] **Step 3: 테스트 실행 — 실패 확인**

Run: `cd backend && npx vitest run tests/scrapers/krx.test.ts`
Expected: FAIL — `Cannot find module '../../src/scrapers/krx.js'`

---

### Task 2: KRX 시장 데이터 스크래퍼 — 구현

**Files:**
- Create: `backend/src/scrapers/krx.ts`

- [ ] **Step 1: KrxScraper 구현**

```typescript
import axios from 'axios';
import type { Pool } from 'pg';
import { BaseScraper } from './base.js';
import type { ScrapedPost } from './types.js';

interface KrxStock {
  ISU_SRT_CD: string;
  ISU_ABBRV: string;
  TDD_CLSPRC: string;
  CMPPREVDD_PRC: string;
  FLUC_RT: string;
  ACC_TRDVOL: string;
  MKT_NM: string;
}

export class KrxScraper extends BaseScraper {
  constructor(pool: Pool) {
    super(pool);
  }

  async fetch(): Promise<ScrapedPost[]> {
    try {
      const today = this.formatDate(new Date());
      const stocks = await this.fetchMarketData(today);

      const sorted = stocks
        .filter(s => s.FLUC_RT && s.FLUC_RT !== '0.00')
        .sort((a, b) => Math.abs(this.parseRate(b.FLUC_RT)) - Math.abs(this.parseRate(a.FLUC_RT)))
        .slice(0, 30);

      return sorted.map(s => this.toPost(s));
    } catch (error) {
      console.error('[krx] scraper error:', error);
      return [];
    }
  }

  private async fetchMarketData(date: string): Promise<KrxStock[]> {
    const params = new URLSearchParams({
      bld: 'dbms/MDC/STAT/standard/MDCSTAT01501',
      mktId: 'STK',
      trdDd: date,
      share: '1',
      money: '1',
      csvxls_isNo: 'false',
    });

    const { data } = await axios.post(
      'http://data.krx.co.kr/comm/bldAttendant/getJsonData.cmd',
      params.toString(),
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          'Referer': 'http://data.krx.co.kr',
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        },
        timeout: 15000,
      },
    );

    return data.OutBlock_1 ?? [];
  }

  private parseRate(rate: string): number {
    return parseFloat(rate.replace(/,/g, '')) || 0;
  }

  private parsePrice(price: string): string {
    return price.replace(/,/g, '').replace(/^\+/, '');
  }

  private formatDate(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}${m}${day}`;
  }

  private toPost(s: KrxStock): ScrapedPost {
    const rate = s.FLUC_RT.startsWith('-') ? s.FLUC_RT : `+${s.FLUC_RT}`;
    return {
      sourceKey: 'krx',
      sourceName: 'KRX 시장',
      title: `${s.ISU_ABBRV} ${rate}% (${s.TDD_CLSPRC}원)`,
      url: `http://data.krx.co.kr/contents/MDC/MDI/mdiLoader/index.cmd?boxid=finder_stkisu0101&input_stkisu=${s.ISU_SRT_CD}`,
      category: 'finance',
      viewCount: parseInt(s.ACC_TRDVOL.replace(/,/g, '')) || 0,
    };
  }
}
```

Write to `backend/src/scrapers/krx.ts`.

- [ ] **Step 2: 테스트 실행 — 통과 확인**

Run: `cd backend && npx vitest run tests/scrapers/krx.test.ts`
Expected: PASS (all 4 tests)

- [ ] **Step 3: sources.json에 KRX 등록**

`backend/src/scrapers/sources.json` — sources 배열 끝에 추가:

```json
{
  "key": "krx",
  "name": "KRX 시장",
  "category": "finance",
  "type": "api",
  "module": "./krx.js",
  "className": "KrxScraper",
  "priority": "low",
  "enabled": true
}
```

- [ ] **Step 4: 커밋**

```bash
git add backend/src/scrapers/krx.ts backend/tests/scrapers/krx.test.ts backend/tests/fixtures/krx-response.json backend/src/scrapers/sources.json
git commit -m "feat(scraper): add KRX market data scraper (top gainers/losers)"
```

---

### Task 3: Google Trends Korea 스크래퍼 — 테스트 작성

**Files:**
- Create: `backend/tests/fixtures/google-trends-response.json`
- Create: `backend/tests/scrapers/google-trends.test.ts`

- [ ] **Step 1: Google Trends mock fixture 생성**

```json
{
  "default": {
    "trendingSearchesDays": [
      {
        "date": "20260329",
        "formattedDate": "2026년 3월 29일 일요일",
        "trendingSearches": [
          {
            "title": { "query": "손흥민" },
            "formattedTraffic": "200,000+",
            "articles": [
              {
                "title": "손흥민, 시즌 15호골 폭발",
                "url": "https://news.example.com/son",
                "source": "스포츠조선"
              }
            ],
            "image": { "imageUrl": "https://example.com/son.jpg" }
          },
          {
            "title": { "query": "삼성전자 실적" },
            "formattedTraffic": "100,000+",
            "articles": [
              {
                "title": "삼성전자 1분기 실적 발표",
                "url": "https://news.example.com/samsung",
                "source": "한국경제"
              }
            ],
            "image": { "imageUrl": "https://example.com/samsung.jpg" }
          }
        ]
      }
    ]
  }
}
```

Write to `backend/tests/fixtures/google-trends-response.json`.

- [ ] **Step 2: Google Trends failing test 작성**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { GoogleTrendsScraper } from '../../src/scrapers/google-trends.js';
import trendsFixture from '../fixtures/google-trends-response.json';

vi.mock('axios');

const mockPool = { query: vi.fn() } as any;

describe('GoogleTrendsScraper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch daily trending searches for Korea', async () => {
    vi.mocked(axios.get).mockResolvedValueOnce({ data: trendsFixture });

    const scraper = new GoogleTrendsScraper(mockPool);
    const posts = await scraper.fetch();

    expect(posts.length).toBe(2);
    expect(posts[0]).toMatchObject({
      sourceKey: 'google_trends',
      sourceName: 'Google 트렌드',
      category: 'trend',
    });
  });

  it('should use query as title and article URL as link', async () => {
    vi.mocked(axios.get).mockResolvedValueOnce({ data: trendsFixture });

    const scraper = new GoogleTrendsScraper(mockPool);
    const posts = await scraper.fetch();

    expect(posts[0].title).toContain('손흥민');
    expect(posts[0].url).toBe('https://news.example.com/son');
    expect(posts[0].thumbnail).toBe('https://example.com/son.jpg');
  });

  it('should fallback to Google search URL if no article', async () => {
    const noArticle = structuredClone(trendsFixture);
    noArticle.default.trendingSearchesDays[0].trendingSearches[0].articles = [];
    vi.mocked(axios.get).mockResolvedValueOnce({ data: noArticle });

    const scraper = new GoogleTrendsScraper(mockPool);
    const posts = await scraper.fetch();

    expect(posts[0].url).toContain('google.com/search');
    expect(posts[0].url).toContain(encodeURIComponent('손흥민'));
  });

  it('should cap at 30 items', async () => {
    const manyItems = structuredClone(trendsFixture);
    const template = manyItems.default.trendingSearchesDays[0].trendingSearches[0];
    manyItems.default.trendingSearchesDays[0].trendingSearches = Array.from(
      { length: 40 },
      (_, i) => ({ ...template, title: { query: `trend-${i}` } }),
    );
    vi.mocked(axios.get).mockResolvedValueOnce({ data: manyItems });

    const scraper = new GoogleTrendsScraper(mockPool);
    const posts = await scraper.fetch();

    expect(posts.length).toBe(30);
  });

  it('should return empty array on error', async () => {
    vi.mocked(axios.get).mockRejectedValueOnce(new Error('timeout'));

    const scraper = new GoogleTrendsScraper(mockPool);
    const posts = await scraper.fetch();

    expect(posts).toEqual([]);
  });
});
```

Write to `backend/tests/scrapers/google-trends.test.ts`.

- [ ] **Step 3: 테스트 실행 — 실패 확인**

Run: `cd backend && npx vitest run tests/scrapers/google-trends.test.ts`
Expected: FAIL — `Cannot find module '../../src/scrapers/google-trends.js'`

---

### Task 4: Google Trends Korea 스크래퍼 — 구현

**Files:**
- Create: `backend/src/scrapers/google-trends.ts`

- [ ] **Step 1: GoogleTrendsScraper 구현**

```typescript
import axios from 'axios';
import type { Pool } from 'pg';
import { BaseScraper } from './base.js';
import type { ScrapedPost } from './types.js';

interface TrendArticle {
  title: string;
  url: string;
  source: string;
}

interface TrendingSearch {
  title: { query: string };
  formattedTraffic: string;
  articles: TrendArticle[];
  image?: { imageUrl?: string };
}

interface TrendsResponse {
  default: {
    trendingSearchesDays: {
      date: string;
      trendingSearches: TrendingSearch[];
    }[];
  };
}

export class GoogleTrendsScraper extends BaseScraper {
  constructor(pool: Pool) {
    super(pool);
  }

  async fetch(): Promise<ScrapedPost[]> {
    try {
      const { data } = await axios.get<TrendsResponse>(
        'https://trends.google.com/trends/trendingsearches/daily',
        {
          params: { geo: 'KR', hl: 'ko' },
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          },
          timeout: 10000,
        },
      );

      const days = data?.default?.trendingSearchesDays ?? [];
      const searches = days.flatMap(d => d.trendingSearches);

      return searches.slice(0, 30).map(s => this.toPost(s));
    } catch (error) {
      console.error('[google-trends] scraper error:', error);
      return [];
    }
  }

  private toPost(s: TrendingSearch): ScrapedPost {
    const query = s.title.query;
    const article = s.articles[0];
    const url = article?.url
      ?? `https://www.google.com/search?q=${encodeURIComponent(query)}`;

    return {
      sourceKey: 'google_trends',
      sourceName: 'Google 트렌드',
      title: `${query} — ${s.formattedTraffic} 검색`,
      url,
      thumbnail: s.image?.imageUrl,
      author: article?.source,
      category: 'trend',
    };
  }
}
```

Write to `backend/src/scrapers/google-trends.ts`.

- [ ] **Step 2: 테스트 실행 — 통과 확인**

Run: `cd backend && npx vitest run tests/scrapers/google-trends.test.ts`
Expected: PASS (all 5 tests)

- [ ] **Step 3: sources.json에 Google Trends 등록**

`backend/src/scrapers/sources.json` — sources 배열 끝에 추가:

```json
{
  "key": "google_trends",
  "name": "Google 트렌드",
  "category": "trend",
  "type": "api",
  "module": "./google-trends.js",
  "className": "GoogleTrendsScraper",
  "priority": "medium",
  "enabled": true
}
```

- [ ] **Step 4: 커밋**

```bash
git add backend/src/scrapers/google-trends.ts backend/tests/scrapers/google-trends.test.ts backend/tests/fixtures/google-trends-response.json backend/src/scrapers/sources.json
git commit -m "feat(scraper): add Google Trends Korea scraper (daily trending searches)"
```

---

## Phase 4: RSS 소스 확장

### Task 5: korea.kr 정부 RSS 3개 + 어피티 RSS 추가

**Files:**
- Modify: `backend/src/scrapers/sources.json`

이 4개 소스는 모두 RSS type이므로 코드 작성 불필요 — JSON 등록만으로 레지스트리가 자동 처리.

- [ ] **Step 1: sources.json에 4개 RSS 소스 추가**

`backend/src/scrapers/sources.json` — sources 배열 끝에 추가:

```json
{
  "key": "korea_press",
  "name": "정책브리핑 보도자료",
  "category": "government",
  "type": "rss",
  "feedUrl": "https://www.korea.kr/rss/pressrelease.xml",
  "priority": "low",
  "enabled": true
},
{
  "key": "korea_policy",
  "name": "정책뉴스",
  "category": "government",
  "type": "rss",
  "feedUrl": "https://www.korea.kr/rss/policy.xml",
  "priority": "low",
  "enabled": true
},
{
  "key": "korea_briefing",
  "name": "부처 브리핑",
  "category": "government",
  "type": "rss",
  "feedUrl": "https://www.korea.kr/rss/ebriefing.xml",
  "priority": "low",
  "enabled": true
},
{
  "key": "uppity",
  "name": "어피티",
  "category": "newsletter",
  "type": "rss",
  "feedUrl": "https://uppity.co.kr/feed/",
  "priority": "low",
  "enabled": true
}
```

- [ ] **Step 2: 전체 테스트 실행**

Run: `cd backend && npx vitest run`
Expected: ALL PASS (기존 테스트 + 신규 KRX/Google Trends 테스트)

- [ ] **Step 3: 커밋**

```bash
git add backend/src/scrapers/sources.json
git commit -m "feat(scraper): add korea.kr government RSS (3 feeds) + 어피티 newsletter RSS"
```

---

### Task 6: 문서 업데이트

**Files:**
- Modify: `docs/로드맵.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: 로드맵 Phase 3·4 완료 체크 + 변경사항 반영**

`docs/로드맵.md` — Phase 3·4 섹션을 완료 상태로 업데이트:

```markdown
### Scale-Up Phase 3: API 소스 + RSS 확장 ✅ (2026-03-29)
- [x] ~~Naver DataLab~~ → Google Trends Korea (실시간 검색어 API 2021 폐지)
- [x] KRX 시장 데이터 (일일 등락 상위, data.krx.co.kr JSON)
- [x] ~~공공데이터포털~~ → korea.kr RSS 3개 (보도자료, 정책뉴스, 부처 브리핑)

### Scale-Up Phase 4: 선별 확장 ✅ (2026-03-29)
- [x] ~~블라인드~~ — ToS 스크래핑 금지, JS 렌더링 (제외)
- [x] ~~뉴닉~~ — RSS 없음, Stibee SPA (제외)
- [x] 어피티 (uppity.co.kr RSS)
```

- [ ] **Step 2: CLAUDE.md 현재 Phase 업데이트**

`CLAUDE.md` — "Current Phase" 섹션:
- "Scale-Up Phase 2" → "Scale-Up Phase 4 완료 (27개 소스)"
- "다음 세션 작업" 섹션을 프론트엔드 UI/UX로 변경

- [ ] **Step 3: 커밋**

```bash
git add docs/로드맵.md CLAUDE.md
git commit -m "docs: update roadmap and CLAUDE.md for Phase 3·4 completion (27 sources)"
```

---

## Summary

| Task | Type | 소스 | 카테고리 | 우선순위 |
|------|------|------|----------|----------|
| 1-2 | API | KRX 시장 | finance | low |
| 3-4 | API | Google Trends Korea | trend | medium |
| 5 | RSS | 정책브리핑 보도자료 | government | low |
| 5 | RSS | 정책뉴스 | government | low |
| 5 | RSS | 부처 브리핑 | government | low |
| 5 | RSS | 어피티 | newsletter | low |

최종: 22개 → **27개** 소스 (community 8 + news 8 + tech 2 + video 1 + deals 1 + alert 1 + **finance 1 + trend 1 + government 3 + newsletter 1**)
