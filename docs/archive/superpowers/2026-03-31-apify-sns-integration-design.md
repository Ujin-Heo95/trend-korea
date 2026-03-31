# Apify SNS 통합 설계

## 개요

Apify 클라우드 스크래핑 플랫폼을 활용하여 Instagram, X(Twitter), TikTok의 트렌딩 콘텐츠를 수집하고, 프론트엔드에 SNS 전용 탭으로 노출한다.

## 요구사항

- **플랫폼 우선순위**: Instagram > X > TikTok
- **수집 방식**: 트렌딩 콘텐츠 (기본) + 핫 키워드 검색 (보조, 추후)
- **수집 주기**: 일 2회 (09:00, 18:00 KST)
- **비용 상한**: 월 $20
- **초기 예상 비용**: ~$3.3/월 (3개 플랫폼, 일 2회, maxItems 30)

## 아키텍처

### 레지스트리 확장

기존 `sources.json`의 `type` 필드에 `"apify"` 값을 추가한다.

```
sources.json (type: "apify" 항목 추가)
       │
  registry.ts (apify 타입 분기 추가)
       │
  ApifyBaseScraper (Actor 호출 추상화)
       │
  ┌────┴───────────────────┐──────────────────┐
  ApifyInstagramScraper  ApifyXScraper     ApifyTiktokScraper
  (mapResult 오버라이드)
```

### sources.json 항목 형태

```json
{
  "key": "apify_instagram_trending",
  "name": "Instagram 트렌딩",
  "category": "sns",
  "type": "apify",
  "actorId": "apify/instagram-hashtag-scraper",
  "module": "./apify-instagram.js",
  "className": "ApifyInstagramScraper",
  "priority": "medium",
  "enabled": true,
  "apifyOptions": { "maxItems": 30 }
}
```

### SourceEntry 타입 확장

```typescript
export interface SourceEntry {
  // 기존 필드...
  type: 'rss' | 'html' | 'api' | 'apify';
  actorId?: string;      // Apify Actor ID
  apifyOptions?: Record<string, unknown>;  // Actor 입력 파라미터
}
```

## Actor 선정

| 플랫폼 | Actor ID | 수집 대상 | maxItems |
|---------|----------|-----------|----------|
| Instagram | `apify/instagram-hashtag-scraper` | 한국 인기 해시태그 게시물 | 30 |
| X | `apidojo/tweet-scraper` | 한국 트렌딩/검색 결과 | 30 |
| TikTok | `clockworks/tiktok-scraper` | 한국 트렌딩 영상 | 30 |

## 데이터 매핑

각 Actor 결과를 기존 `ScrapedPost` 포맷으로 변환한다.

| ScrapedPost 필드 | Instagram | X | TikTok |
|-----------------|-----------|---|--------|
| `title` | 캡션 (100자 절삭) | 트윗 본문 (100자) | 설명 (100자) |
| `url` | 게시물 링크 | 트윗 링크 | 영상 링크 |
| `thumbnail` | 이미지 URL | 미디어 URL | 커버 이미지 |
| `author` | 사용자명 | @핸들 | 사용자명 |
| `viewCount` | 좋아요 수 | 조회수 | 조회수 |
| `commentCount` | 댓글 수 | 리플 수 | 댓글 수 |
| `category` | `"sns"` | `"sns"` | `"sns"` |
| `metadata` | `{ platform: "instagram", likes, shares }` | `{ platform: "x", retweets, likes }` | `{ platform: "tiktok", likes, shares }` |

## 비용 제어

### 환경변수

- `APIFY_API_TOKEN`: Apify API 토큰
- `APIFY_MONTHLY_BUDGET_CENTS`: 월 상한 (기본값 2000 = $20)

### 제어 흐름

```
ApifyBaseScraper.fetch()
  → DB에서 이번 달 Apify 실행 비용 합산 조회 (apify_usage 테이블)
  → 상한 초과? → skip + Discord 알림 + 로그
  → 미만? → Actor 실행 → 실제 비용을 apify_usage에 기록
```

### apify_usage 테이블

```sql
CREATE TABLE IF NOT EXISTS apify_usage (
  id SERIAL PRIMARY KEY,
  actor_id TEXT NOT NULL,
  source_key TEXT NOT NULL,
  cost_usd NUMERIC(10,6) NOT NULL,
  items_count INTEGER NOT NULL,
  executed_at TIMESTAMPTZ DEFAULT NOW()
);
```

## 스케줄링

기존 `scheduler/index.ts`의 `node-cron`에 추가:

```
0 0,9 * * *   → Apify 소스 실행 (00:00 UTC = 09:00 KST, 09:00 UTC = 18:00 KST)
```

Apify Actor는 `p-limit(1)`로 순차 실행하여 동시 실행 비용을 방지한다.

## 파일 구조

### 신규 파일

| 파일 | 역할 |
|------|------|
| `backend/src/scrapers/apify-base.ts` | ApifyBaseScraper — Actor 호출, 비용 제어, 일일 카운터 |
| `backend/src/scrapers/apify-instagram.ts` | Instagram Actor 결과 → ScrapedPost 변환 |
| `backend/src/scrapers/apify-x.ts` | X Actor 결과 → ScrapedPost 변환 |
| `backend/src/scrapers/apify-tiktok.ts` | TikTok Actor 결과 → ScrapedPost 변환 |
| `frontend/src/components/SnsRankingTable.tsx` | SNS 탭 전용 카드형 테이블 |
| `backend/src/db/migrations/XXX_add_apify_usage.sql` | apify_usage 테이블 생성 |

### 수정 파일

| 파일 | 변경 |
|------|------|
| `backend/src/config/index.ts` | `APIFY_API_TOKEN`, `APIFY_MONTHLY_BUDGET_CENTS` 환경변수 추가 |
| `backend/src/scrapers/sources.json` | `type: "apify"` 항목 3개 추가 |
| `backend/src/scrapers/registry.ts` | `type === 'apify'` 분기, `SourceEntry` 타입 확장 |
| `backend/src/scheduler/index.ts` | 09:00/18:00 KST cron job 추가 |
| `frontend/src/pages/HomePage.tsx` | `sns` 카테고리 탭 추가 |
| `backend/package.json` | `apify-client` 의존성 추가 |

### 변경하지 않는 것

- `BaseScraper.saveToDb()` — 기존 UPSERT 로직 그대로 재활용
- `services/dedup.ts` — SNS 게시물도 기존 중복제거 파이프라인 적용
- `services/scoring.ts` — 기존 트렌드 스코어링 자동 적용
- DB 스키마 `posts` 테이블 — `category='sns'` + `metadata` JSONB로 충분

## 프론트엔드 — SNS 탭

- 카테고리 `"sns"`로 기존 탭 시스템에 추가
- 플랫폼별 아이콘 뱃지 (Instagram/X/TikTok) — `metadata.platform`으로 구분
- 게시물 카드: 썸네일 + 캡션 미리보기 + engagement 수치 (좋아요/댓글)
- 기존 `HomePage.tsx`의 탭 구조 재활용

## 향후 확장

- **키워드 검색**: 핫이슈 키워드 추출(Gemini) 결과를 Apify 검색 Actor에 연동
- **교차 검증**: SNS engagement 데이터를 `trendCrossValidator`에 시그널로 추가
- **주기 조절**: 비용 여유 시 일 2회 → 4~6회로 상향
