# 콘텐츠 랭킹 시스템 (v8)

> 2026-04-12 기준 — v8 통합 파이프라인. 커밋 `72b6604` 부터 도입.
> 관련 문서: `docs/issue_ranking.md` (클러스터 → 이슈 집계), `plans/jiggly-watching-pixel.md` (설계 배경).
> 주요 파일: `backend/src/services/v8/` (unifiedScoring / crossChannelEcho / postClustering / issueRanker / pipeline).

---

## 1. 적용 범위

v8 스코어링은 네 개 채널 전부를 **동일 공식**으로 처리한다.

| 채널 | 소스 예시 |
|------|-----------|
| `community` | dcinside, theqoo, fmkorea, clien, bobaedream, ... |
| `news` | yna, sbs, chosun, khan, hani, mk, hankyung, ... |
| `video` | YouTube (뉴스 채널 + 일반 채널) |
| `portal` | nate_news, zum_news (포털 인기기사) |

`SCORED_CATEGORIES_SQL` 로 필터링되며, 그 외(핫딜/여행/엔터 등)는 여전히 최신순(`scraped_at DESC`)만 표시한다.

---

## 2. 통합 스코어 공식

v8 은 채널 분기가 없다. 모든 포스트는 다음 한 줄로 계산된다.

```
rawScore        = authority × freshness × engagement × topicImportance × crossChannelEcho
normalizedScore = channel 내 log Z-score (채널 간 비교 가능한 양수)
```

5 개 신호 모두 `[1.0, ∞)` 배수 (freshness 만 `(0, 1.0]`). 모든 승수가 완결되면 `log1p` 후 채널별 Z-score 로 정규화해 `max(0, 2.5 + z)` 로 시프트한다. 결과적으로 다른 채널 간 `normalizedScore` 가 직접 비교 가능하다.

구현: `backend/src/services/v8/unifiedScoring.ts` — `computeUnifiedScores()`.

---

## 3. 5 개 신호 상세

### 3.1 authority — 소스 티어

소스 권위를 직접 매핑. 커뮤니티는 A/B/C/D 티어, 그 외 채널은 전역 sourceWeight.

```
community :  authority = max(1.0, 0.5 + communityTier)     // 1.0 ~ 1.75
news/portal/video :
             authority = max(1.0, sourceWeight)            // 1.0 ~ 2.8
```

- `scoring-weights.ts` 의 `getSourceWeightFrom` / `getCommunitySourceWeightFrom` 재사용.
- T1 통신사(yna 등)는 자연스럽게 높은 가중을 받고, 인플루언서/소규모 커뮤니티는 1.0 근처에 머문다.

### 3.2 freshness — 지수 감쇠

```
ageMin    = max(0, now - (publishedAt ?? scrapedAt))  // minutes
freshness = exp(-ln2 × ageMin / halfLife)
```

halfLife 는 v7 의 소스별 값이 그대로 유지된다. 채널당 상수가 아니라 **소스별 DB config**.

| 소스 그룹 | halfLife |
|-----------|---------:|
| yna, newsis, naver_news_ranking | 180m |
| sbs, kbs, mbc, jtbc | 240m |
| 종합일간지 (chosun, donga, hani, khan) | 300m |
| 경제지 (mk, hankyung, etnews) | 320m |
| 커뮤니티 빠른 순환 (dcinside, fmkorea) | 120m |
| 커뮤니티 표준 (theqoo, instiz, natepann) | 150m |
| 커뮤니티 느린 순환 (clien, bobaedream) | 200m |
| video (기본) | 360m |

portal 은 news halfLife 를, video 는 채널 기본 halfLife 를 따른다.

### 3.3 engagement — 채널 내 Z-score

```
raw      = viewCount + 2×commentCount + 3×likeCount
logVal   = log1p(raw)
z        = (logVal - meanLog_channel) / stdLog_channel
mapped   = 1.0 + tanh(z / 1.5) × 0.75       // [-2,+2] → ~[0.5, 1.75]
engagement = max(0.5, mapped)
```

- 채널 내 평균/표준편차 기반이므로 커뮤니티의 10만 조회 ≈ 뉴스의 5만 조회처럼 상대화된다.
- theqoo 등 좋아요 미수집 소스도 views·comments 만으로 정상 분포에 들어온다 (v7 의 메트릭 완전성 보정 로직은 불필요해짐).

### 3.4 topicImportance — 클러스터 품질

포스트가 속한 k-NN 클러스터 크기 + 소스 다양성 + 채널 다양성.

```
size     = cluster.memberPostIds.length
sizeF    = log2(1 + size)                          // 2→1.58, 10→3.46
srcF     = log2(1 + cluster.uniqueSources)
chanF    = 1.0 + 0.25 × (cluster.uniqueChannels - 1)
raw      = 1.0 + 0.3×sizeF + 0.25×srcF + (chanF - 1.0)
topicImportance = max(1.0, raw)
```

- **Singleton(클러스터 미소속 또는 size=1)** 은 1.0 중립.
- v7 의 clusterImportance / portalRank / breakingBoost / trendSignalBonus / volumeDampening 이 전부 이 한 신호로 흡수되었다.

### 3.5 crossChannelEcho — 타 채널 반향 (v8 신규)

v8 의 핵심 신규 신호. 포스트 P 가 embedding 공간에서 `cos ≥ 0.75` 이웃 중 **타 채널** 포스트를 몇 개 가지는지로 계산한다.

```
N    = #(타 채널 이웃 중 cos ≥ 0.75)
avgA = mean(타 채널 이웃들의 sourceWeight)
echo = 1.0 + min(0.25 × sqrt(N) × avgA,  1.0)       // ECHO_CAP = 1.0 → 최대 2.0x
```

- `alpha = 0.25`, `ECHO_CAP = 1.0`, threshold = `0.75` (`backend/src/services/v8/crossChannelEcho.ts` 상수).
- 타 채널 이웃이 0 개이면 `echo = 1.0` 중립.
- 의도: 커뮤니티에서 폭발 중인 주제가 뉴스에 보도되기 시작하면 그 **커뮤니티 포스트 자체** 랭킹이 올라간다 — v7 까지는 이슈 카드 단계에서만 잡히던 신호가 post 레벨로 내려왔다.

---

## 4. 클러스터링 (k-NN)

`backend/src/services/v8/postClustering.ts` — Union-Find + brute-force 코사인.

```
방어선 4 개:
  1) cos ≥ 0.78 (엄격)
  2) |Δt| ≤ 12h
  3) 클러스터 max size = 50 (초과하면 union 취소)
  4) cross-source ≥ 2 (issueRanker 에서 적용)
```

- 알고리즘: O(N²), N ≤ 4000 (12h 윈도우 × MAX_POSTS). 측정치 ~2–3s.
- stable id = `v8-cluster-{minPostId}` (deterministic).
- Singleton 은 반환값에는 포함되지만 issue 생성 단계에서 `filterMultiSourceClusters` 로 제거된다.
- 임베딩은 `text-embedding-004` (Gemini), 캐시는 기존 `embedding.ts` 재사용. 임베딩 누락 포스트는 echo = 1.0, cluster singleton 으로 처리되고 랭킹은 계속된다.

---

## 5. 파이프라인 실행 순서

`backend/src/services/v8/pipeline.ts` — `runV8Pipeline(pool)` 1 tick:

```
loadPosts (12h 윈도우, MAX_POSTS=4000)
   ↓
ensureEmbeddings (캐시 미스만 Gemini 호출)
   ↓
clusterPosts      → V8Cluster[]
   ↓
computeCrossChannelEcho → Map<postId, EchoResult>
   ↓
computeUnifiedScores    → V8PostScore[] + byChannel index
   ↓
rankIssues (→ docs/issue_ranking.md)
   ↓
persistIssueRankings (트랜잭션: DELETE + INSERT)
```

스케줄러에서 10 분 주기로 호출. `preloadWeights()` 로 source tier / halfLife 를 한 번에 로드한다.

---

## 6. Migration from v7

v7 대비 제거된 것:

| 항목 | 제거 사유 |
|------|-----------|
| 채널별 분기 공식 (커뮤니티 곱셈 vs 뉴스 가산혼합 signalScore) | 단일 `authority × freshness × engagement × topicImportance × echo` 로 통일 |
| `portalRank` | `authority` (포털 소스 weight) + `topicImportance` (cross-channel 클러스터) 로 흡수 |
| `breakingBoost` (속보 감지) | `freshness` 가 소스별 halfLife 로 충분. T1 속보는 authority 가 담당 |
| `trendSignalBonus` / `trendAlignment` | 외부 트렌드 키워드 매칭 로직 제거. trend_keywords 는 여전히 수집되지만 스코어링에는 미사용 |
| `volumeDampening` | 채널 내 Z-score 정규화가 같은 역할 수행 |
| `normalizedEngagement` 의 메트릭 완전성 보정 | Z-score 가 분포 자체를 정규화하므로 불필요 |
| `communityVelocityBonus` / 속도 보너스 | `engagement` Z-score 하나로 통합 |
| IDF 게이트 / entity 게이트 / bridge-cluster guard | embedding cos ≥ 0.78 + size cap + cross-source≥2 로 대체 |
| `subcategoryNorm` / 카테고리 가중치 | 카테고리는 issueRanker 의 keyword heuristic 라벨링 용도로만 사용 |

삭제된 파일:

- `backend/src/services/issueAggregator.ts` (~1000 lines)
- `backend/src/services/entityExtractor.ts`
- `backend/src/services/mergeArbiterWorker.ts`
- `backend/src/services/scoring-helpers.ts` 의 channel-specific 함수 (normalizedEngagement 계산 일부만 unifiedScoring 으로 이식)
- 연관 테스트 (`issueAggregator-*.test.ts`, `entityExtractor.test.ts` 등)

유지된 것: `scoring-weights.ts` 의 source tier / halfLife 맵, `embedding.ts` 캐시·배치, `post_clusters` / `post_cluster_members` 스키마, `issue_rankings` 스키마.

---

## 7. Storage

`issue_rankings` 테이블은 v7 과 동일하지만 컬럼 의미가 일부 달라졌다. v8 매핑은 `docs/issue_ranking.md` §5 참조.

## 8. 파일 인덱스

| 역할 | 경로 |
|------|------|
| 타입 계약 | `backend/src/services/v8/types.ts` |
| 통합 스코어 | `backend/src/services/v8/unifiedScoring.ts` |
| 타 채널 반향 | `backend/src/services/v8/crossChannelEcho.ts` |
| k-NN 클러스터링 | `backend/src/services/v8/postClustering.ts` |
| 이슈 랭커 | `backend/src/services/v8/issueRanker.ts` |
| 파이프라인 오케스트레이션 | `backend/src/services/v8/pipeline.ts` |
| 소스 티어·halfLife | `backend/src/services/scoring-weights.ts` |
| 임베딩 캐시·배치 | `backend/src/services/embedding.ts` |
