# 이슈 랭킹 파이프라인 (전체 탭)

> 마지막 업데이트: 2026-04-11
> 관련 파일: `scoring.md` (개별 포스트 스코어링), 본 문서 (이슈 집계 및 순위 결정)

## 1. 개요

'전체' 탭은 개별 포스트가 아닌 **이슈(Issue)** 단위로 랭킹을 표시한다.
이슈는 유사한 포스트들의 그룹이며, `issue_rankings` 테이블에 저장된다.

**파이프라인 실행 주기**: 5분 (KST 02:00-06:00 quiet hours 제외)

```
calculateScores()       ← 개별 포스트 trend_score 계산 (scoring.ts)
    ↓
aggregateIssues()       ← 이슈 그룹핑 + 이슈 점수 산출 (issueAggregator.ts)
    ↓
summarizeAndUpdateIssues()  ← Gemini 제목/요약/카테고리 생성 (geminiSummarizer.ts)
```

스케줄러: `scheduler/index.ts:48-56`

---

## 2. 파이프라인 상세 (8 Steps)

### Step 1: 스코어된 포스트 조회 (`fetchScoredPosts`)

**파일**: `issueAggregator.ts:159-186`

```sql
SELECT p.id, p.source_key, p.category, p.title, p.content_snippet, p.thumbnail,
       COALESCE(ps.trend_score, 0) AS trend_score,
       pcm.cluster_id
FROM posts p
LEFT JOIN post_scores ps ON ps.post_id = p.id
LEFT JOIN post_cluster_members pcm ON pcm.post_id = p.id
WHERE p.scraped_at > NOW() - INTERVAL '{windowHours} hours'
  AND COALESCE(p.category, '') IN ('news','press','community','video','video_popular')
ORDER BY COALESCE(ps.trend_score, 0) DESC
```

- **윈도우**: 기본 12시간 (`ISSUE_WINDOW_HOURS`, DB 설정 가능)
- **대상 카테고리**: news, press, community, video, video_popular
- `trend_score`는 `post_scores` 테이블에서 JOIN (5분마다 갱신)
- `cluster_id`는 `post_cluster_members`에서 JOIN (중복제거 서비스가 관리)

### Step 2: 클러스터 그룹 빌드 (`buildClusterGroups`)

**파일**: `issueAggregator.ts:195-224`

- 같은 `cluster_id`를 가진 포스트를 하나의 그룹으로 묶음
- `cluster_id`가 NULL인 standalone 포스트 중 **뉴스 또는 뉴스 영상**이면 독립 그룹 생성
- standalone 커뮤니티 포스트는 **이 단계에서 탈락** (뉴스 앵커가 없으면 이슈 불가)

### Step 3: 트렌드 키워드 기반 병합 (`mergeViaTrendKeywords`)

**파일**: `issueAggregator.ts:228-344`

- `trend_keywords` 테이블의 외부 키워드 (Google Trends, Naver DataLab, BigKinds)와 포스트 제목+본문 매칭
- 같은 키워드에 매칭된 그룹을 **Union-Find**로 병합
- 병합 후 포스트를 news/community/video로 분류
- `trendSignalScore` 산출: `computeTrendSignalBonus(match) - 1.0` (0 이상)

### Step 3.5: 이슈 제목 유사도 중복제거 (`deduplicateIssuesByTitle`)

**파일**: `issueAggregator.ts:346-402`

- 각 이슈의 대표 제목(최고 점수 뉴스 포스트)에서 bigram 추출
- **Jaccard 유사도 ≥ 0.55**이면 같은 이슈로 병합 (Union-Find)
- 임계값은 `ISSUE_DEDUP_THRESHOLD`로 DB 설정 가능

### Step 4: 점수 산출 및 필터 (`scoreAndFilter`)

**파일**: `issueAggregator.ts:406-430`

**진입 필터**: 뉴스 포스트 ≥1개 OR 뉴스 채널 영상 ≥1개 (커뮤니티 전용 이슈는 제외)

**이슈 점수 공식** (v2 — 로그 체감 + 모멘텀 + 다양성 + 속보 부스트):

```
// 채널별 집계 — clusterBonus 제거 + 로그 체감 (Fix 1+2)
newsAgg = Σ(baseScore_i / (1 + K × ln(1+i)))  // i=순위별 내림차순
communityAgg = 동일 공식
videoAgg = 동일 공식 (뉴스채널 ×1.0, 일반 ×0.4 적용 후)
// baseScore = trendScore / clusterBonus (이중 적용 제거)

// 커뮤니티 동적 가중치 (Fix 4)
effectiveCW = COMMUNITY_WEIGHT + COMMUNITY_BOOST × min(communityIntensity/3, 1)

// 기본 점수 합산
rawScore = newsAgg × NEWS_WEIGHT
         + communityAgg × effectiveCW
         + videoAgg
         + trendSignalScore × TREND_SIGNAL_WEIGHT

// 곱셈 보너스 (Fix 3+5+6)
issueScore = rawScore × momentumBonus × diversityBonus × breakingKeywordBoost
```

| 컴포넌트 | 산출 방식 | 기본값 |
|----------|----------|--------|
| `newsAgg` | 로그 체감 집계 (K=0.7). post1=100%, post2=67%, post10=34% | NEWS_WEIGHT=1.0 |
| `communityAgg` | 동일 로그 체감 | COMMUNITY_WEIGHT=0.6 (동적 최대 0.9) |
| `videoAgg` | 동일 로그 체감 (뉴스채널 ×1.0, 일반 ×0.4) | — |
| `trendSignalScore` | Step 3에서 산출된 외부 트렌드 신호 점수 | 0.4 |
| `momentumBonus` | 최근 1h vs 이전 2h 가속도 기반 [0.7, 1.8] | — |
| `diversityBonus` | 소스 다양성 + 채널 교차 보너스 [1.0, 2.5] | — |
| `breakingKeywordBoost` | 제목에 "속보/긴급" 포함 시 [1.0, 3.0], 30분 반감기 | — |

**뉴스 영상 소스**: youtube_sbs_news, youtube_ytn, youtube_mbc_news, youtube_kbs_news, youtube_jtbc_news

**정렬**: `issueScore DESC`

### Step 5: Top N 선택

**파일**: `issueAggregator.ts:145`

- `scoredIssues.slice(0, cfg.maxIssues)` — 기본 30개

### Step 6: 이슈 행 빌드 (`buildIssueRow`)

**파일**: `issueAggregator.ts:458-504`

- 대표 제목: 최고 점수 뉴스 포스트의 제목
- 대표 썸네일: 뉴스 > 영상 > 커뮤니티 순으로 유효한 썸네일 선택
- 카테고리 라벨: 제목 키워드 기반 추론 (정치/경제/연예/스포츠/IT과학/세계/생활/사회)
- `stableId`: cluster_ids + standalone_post_ids의 MD5 해시 (순위 변동 추적용)

### Step 7: 순위 변동 계산 (`calculateRankChanges`)

**파일**: `issueAggregator.ts:527-575`

- `issue_rankings_history` 테이블의 최신 배치와 비교
- 매칭 우선순위: ① `stableId` 일치 → ② cluster/standalone ID 50% 이상 겹침
- `rankChange = 이전순위 - 현재순위` (양수 = 상승, 음수 = 하락, null = 신규)

### Step 8: DB 기록 (`writeIssueRankings`)

**파일**: `issueAggregator.ts:579-640`

- 트랜잭션 내에서 `DELETE FROM issue_rankings` → 새 행 INSERT
- **TTL**: 기본 6시간, quiet hours(01:00-06:00 KST) 진입 시 07:00 KST까지 연장
- `issue_rankings_history`에 시간별 스냅샷 저장 (순위 변동 추적용)

---

## 3. 개별 포스트 스코어링 (요약)

> 상세: `docs/scoring.md` 참조

이슈 점수의 입력값인 개별 포스트 `trend_score`는 다음과 같이 산출:

```
# 뉴스 채널 (4항 가산 혼합)
signalScore = max(portalRank×0.35 + clusterImportance×0.30
              + trendAlignment×0.20 + engagementSignal×0.15, 1.0)
trend_score = signalScore × decay × sourceWeight × subcategoryNorm
            × breakingBoost × freshnessBonus × volumeDampening

# 커뮤니티 채널 (곱셈 기반)
trend_score = normalizedEngagement × decay × communitySourceWeight
            × velocityBonus × clusterBonus × trendSignalBonus × volumeDampening
```

**파일**: `scoring-helpers.ts:39-50`, `scoring.ts:125-207`

### 주요 팩터

| 팩터 | 범위 | 뉴스 | 커뮤니티 | 설명 |
|------|------|------|----------|------|
| `signalScore` | [1.0, 10.0] | ✓ | — | 4항 가산 혼합 (portal+cluster+trend+engagement) |
| `decay` | [0, 1.0] | ✓ (소스별) | ✓ (소스별) | 지수 감쇠 |
| `sourceWeight` | [0.8, 2.5] | ✓ | ✓ | 소스 신뢰도 |
| `freshnessBonus` | [1.0, 1.3] | ✓ | — | 발행 30분 이내 1.3x |
| `breakingBoost` | [1.0, 3.0] | ✓ | — | 속보 감지 (다중소스 3.0, T1 단독 2.0) |
| `velocityBonus` | [1.0, 1.6] | — | ✓ | 최근 2시간 참여 변화율 |
| `clusterBonus` | [1.0, 3.0] | — | ✓ | 중복 포스트 수 + 다양성 |
| `trendSignalBonus` | [1.0, 1.8] | — | ✓ | 외부 트렌드 키워드 매칭 |

### 채널별 Decay 반감기

| 채널 | 반감기 | 24시간 후 잔여 |
|------|--------|--------------|
| SNS | 120분 | 0.002% |
| 커뮤니티 | 120-200분 (소스별) | 0.002%-0.3% |
| 뉴스 | 180-320분 (소스별) | 0.5%-4% |
| 전문 | 300분 | 0.46% |
| 영상 | 360분 | 6.25% |

---

## 4. API 엔드포인트

### `GET /api/issues`

**파일**: `routes/issues.ts:31-206`

**쿼리**:
```sql
SELECT * FROM issue_rankings
WHERE expires_at > NOW()
ORDER BY issue_score DESC
LIMIT $1 OFFSET $2
```

**캐시**:
- 서버: LRU 캐시 50개 항목, TTL 60초 (`cache key: issues:{page}:{limit}`)
- 클라이언트: React Query staleTime 30초, refetchInterval 60초 (quiet hours 5분)

**프론트엔드**: `useIssueRankings.ts` → `IssueRankingList.tsx` → `IssueCard`
- 고정 30개, 페이지 1만 요청
- 클라이언트 측 재정렬 **없음** — 서버 순서 그대로 표시

---

## 5. 설정 테이블 (`scoring_config`)

`issue_aggregator` 그룹의 런타임 설정 가능 파라미터:

| 키 | 기본값 | 범위 | 설명 |
|----|--------|------|------|
| `ISSUE_WINDOW_HOURS` | 12 | 1-48 | 포스트 수집 윈도우 |
| `MAX_ISSUES` | 30 | 5-100 | 표시할 최대 이슈 수 |
| `NEWS_WEIGHT` | 1.0 | 0.1-5.0 | 뉴스 점수 비중 |
| `COMMUNITY_WEIGHT` | 0.6 | 0.0-5.0 | 커뮤니티 기본 가중치 |
| `TREND_SIGNAL_WEIGHT` | 0.4 | 0.0-5.0 | 트렌드 신호 비중 |
| `ISSUE_DEDUP_THRESHOLD` | 0.55 | 0.1-1.0 | 이슈 중복 판정 임계값 |
| `DIMINISHING_K` | 0.7 | 0.1-2.0 | 포스트 수 체감 기울기 (K값) |
| `MOMENTUM_WEIGHT` | 0.4 | 0.0-1.0 | 모멘텀 ln 계수 |
| `MOMENTUM_PENALTY_MIN` | 0.7 | 0.5-1.0 | 비활성 이슈 최소 승수 |
| `COMMUNITY_BOOST` | 0.3 | 0.0-0.5 | 커뮤니티 바이럴 추가 가중치 |
| `DIVERSITY_CAP` | 2.5 | 1.0-5.0 | 소스 다양성 보너스 상한 |
| `CROSS_SOURCE_2` | 0.1 | 0.0-0.3 | 2채널 교차 보너스 |
| `CROSS_SOURCE_3` | 0.2 | 0.0-0.5 | 3채널 교차 보너스 |
| `BREAKING_KW_HALFLIFE` | 30 | 10-120 | 속보 키워드 부스트 반감기 (분) |
| `BREAKING_KW_MAX_BOOST` | 3.0 | 1.5-5.0 | 속보 키워드 최대 부스트 |

설정 정의: `scoringConfigDefaults.ts`, 로딩: `scoringConfig.ts`

### 5-2. 모멘텀 기반 동적 TTL 및 급상승 배지

- `momentum_score` 컬럼이 `issue_rankings`에 저장됨
- `momentum_score ≥ 1.5`: 프론트엔드 "급상승" 배지 표시
- `momentum_score ≤ 0.7`: TTL 2시간으로 단축 (비활성 이슈 빠른 퇴출)
- 기본 TTL: 6시간, 야간(KST 01-06): 07:00 KST까지 연장

---

## 6. DB 스키마

### `issue_rankings`

```sql
CREATE TABLE issue_rankings (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  summary TEXT,
  category_label TEXT,
  issue_score FLOAT NOT NULL DEFAULT 0,
  news_score FLOAT NOT NULL DEFAULT 0,
  community_score FLOAT NOT NULL DEFAULT 0,
  trend_signal_score FLOAT NOT NULL DEFAULT 0,
  video_score FLOAT NOT NULL DEFAULT 0,
  news_post_count INT DEFAULT 0,
  community_post_count INT DEFAULT 0,
  video_post_count INT DEFAULT 0,
  representative_thumbnail TEXT,
  cluster_ids INT[] NOT NULL DEFAULT '{}',
  standalone_post_ids INT[] NOT NULL DEFAULT '{}',
  matched_trend_keywords TEXT[] DEFAULT '{}',
  rank_change INT,
  stable_id TEXT,
  calculated_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ
);

CREATE INDEX idx_issue_rankings_score ON issue_rankings(issue_score DESC);
```

### 관련 테이블

| 테이블 | 역할 |
|--------|------|
| `post_scores` | 개별 포스트 trend_score (5분 주기 갱신) |
| `post_clusters` | 중복 포스트 클러스터 정의 |
| `post_cluster_members` | 클러스터-포스트 매핑 |
| `trend_keywords` | 외부 트렌드 키워드 (15분 주기 갱신, 12h TTL) |
| `issue_rankings_history` | 시간별 순위 스냅샷 (순위 변동 계산용) |

---

## 7. 파일 인덱스

| 역할 | 경로 |
|------|------|
| 이슈 집계 메인 | `backend/src/services/issueAggregator.ts` |
| 포스트 스코어링 배치 | `backend/src/services/scoring.ts` |
| 스코어링 공식 | `backend/src/services/scoring-helpers.ts` |
| 가중치 상수 | `backend/src/services/scoring-weights.ts` |
| DB 설정 기본값 | `backend/src/services/scoringConfigDefaults.ts` |
| 설정 로더 | `backend/src/services/scoringConfig.ts` |
| 트렌드 신호 | `backend/src/services/trendSignals.ts` |
| Gemini 요약 | `backend/src/services/geminiSummarizer.ts` |
| 스케줄러 | `backend/src/scheduler/index.ts` |
| Issues API | `backend/src/routes/issues.ts` |
| 프론트엔드 훅 | `frontend/src/hooks/useIssueRankings.ts` |
| 이슈 카드 목록 | `frontend/src/components/IssueRankingList.tsx` |
| DB 마이그레이션 | `backend/src/db/migrations/037_issue_rankings.sql` |
| DB 마이그레이션 v2 | `backend/src/db/migrations/042_issue_rankings_v2.sql` |
