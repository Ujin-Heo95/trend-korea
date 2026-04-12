# 이슈 랭킹 파이프라인 (v8)

> 2026-04-12 기준 — v8 통합 파이프라인. 커밋 `72b6604` 부터 도입.
> 관련 문서: `docs/scoring.md` (5 개 신호 + 통합 공식).
> 주요 파일: `backend/src/services/v8/`.

## 1. 개요

'전체' 탭은 여전히 **이슈(Issue)** 단위로 랭킹된다. v8 에서 이슈는 곧 **k-NN 클러스터** 이다. v7 의 8 스텝 집계 파이프라인(trend-keyword union-find → 제목 Jaccard dedup → entity arbitration → bridge-cluster guard → 채널별 집계)은 전부 폐기되고, 다음 한 줄로 대체된다.

```
issue_score = Σ(top-K=10 normalizedScore) × channel_breadth_bonus
```

파이프라인 실행 주기는 여전히 10 분. `scheduler/index.ts` 가 `runV8Pipeline(pool)` 을 호출한다.

---

## 2. 파이프라인 순서

```
loadPosts → ensureEmbeddings → clusterPosts → computeCrossChannelEcho
  → computeUnifiedScores → rankIssues → persistIssueRankings
```

| 단계 | 파일 | 요약 |
|------|------|------|
| loadPosts | `v8/pipeline.ts` | 12h 윈도우, `SCORED_CATEGORIES_SQL` 필터, MAX_POSTS=4000 |
| ensureEmbeddings | `embedding.ts` | 캐시 미스만 Gemini `text-embedding-004` 배치 호출 |
| clusterPosts | `v8/postClustering.ts` | Union-Find + brute-force cosine, 4 방어선 |
| computeCrossChannelEcho | `v8/crossChannelEcho.ts` | 타 채널 k-NN 반향 신호 |
| computeUnifiedScores | `v8/unifiedScoring.ts` | 5 개 신호 곱 + 채널별 log Z-score |
| rankIssues | `v8/issueRanker.ts` | 본 문서 §3 참조 |
| persistIssueRankings | `v8/pipeline.ts` | `issue_rankings` 트랜잭션 재기록 |

---

## 3. 이슈 랭커

`backend/src/services/v8/issueRanker.ts` — 클러스터 → 랭킹된 `V8IssueCard` 리스트.

### 3.1 게이트

1. **cross-source ≥ 2** — `filterMultiSourceClusters()`. 고립 singleton 은 이슈가 될 수 없다.
2. **news OR portal ≥ 1** — `channelBreakdown.news + channelBreakdown.portal ≥ 1`. 커뮤니티·영상만으로 구성된 클러스터는 이슈 생성 금지 (v7 의 "뉴스 앵커" 정책 계승).

### 3.2 스코어 공식

```
topK   = memberScores.slice(0, 10)                           // TOP_K_POSTS = 10
sumTopK = Σ topK.normalizedScore
breadthBonus = 1.0 + 0.25 × (cluster.uniqueChannels - 1)     // 최대 1.75 @ 4 채널
issueScore   = sumTopK × breadthBonus
```

- `normalizedScore` 는 이미 채널별 Z-score 정규화된 값이라 가중치 재조정 없이 단순 합산해도 채널 공정성이 유지된다.
- `CHANNEL_BREADTH_ALPHA = 0.25` — community+news 만 겹쳐도 1.25x, 4 채널 전부 겹치면 1.75x.
- 로그 체감(`DIMINISHING_K`), 모멘텀(`momentumBonus`), 속보 키워드 부스트(`breakingKeywordBoost`) 같은 v7 승수는 전부 제거되었다 — 모멘텀은 `freshness` 가, 속보는 `authority × freshness` 가, 다양성은 `topicImportance` + `breadthBonus` 가 담당한다.

### 3.3 대표 포스트 선정

우선순위 배열 `['news', 'portal', 'video', 'community']` 순으로 클러스터 내에서 `normalizedScore` 최상위 포스트를 찾아 사용.

- **제목**: 위 순서의 첫 매칭 포스트 제목.
- **썸네일**: 동일 순서로 `thumbnailUrl != null` 인 첫 포스트.
- **카테고리 라벨**: 대표 제목 키워드 휴리스틱 (`categorizeByKeyword`) — 정치 / 경제 / 연예 / 스포츠 / 사회 / IT / 종합.

### 3.4 정렬

`cards.sort((a, b) => b.issueScore - a.issueScore)`. Top N 제한은 persist 단계에서 걸지 않고 모두 기록 — 실질적으로 cross-source ≥ 2 필터와 news/portal 게이트만으로 20~30 건으로 수렴한다.

---

## 4. 클러스터링 방어선

자세한 로직은 `docs/scoring.md` §4. 요약:

```
cos ≥ 0.78     AND  |Δt| ≤ 12h
clusterSize ≤ 50 (union 취소로 방지)
cross-source ≥ 2 (issueRanker 게이트)
```

Bridge-cluster 사고(`lessons_issue_bridge_cluster.md`)의 전이 병합 루프홀은 embedding 기반 strict threshold + size cap 으로 구조적으로 막혔다. v7 의 entity 게이트 / KNOWN_ORGS / 누적-루트 가드는 전부 불필요해 제거되었다.

---

## 5. 영속화 (`issue_rankings`)

`persistIssueRankings()` 는 트랜잭션 내에서 `DELETE FROM issue_rankings` 후 전체 재기록한다. 테이블 스키마는 v7 과 동일하지만 일부 컬럼의 **의미가 달라졌다**.

| 컬럼 | v8 매핑 |
|------|---------|
| `title` | 대표 포스트 제목 (news → portal → video → community 우선순위) |
| `category_label` | keyword heuristic 결과 |
| `issue_score` | `sumTopK × breadthBonus` |
| `news_score` | topK 중 `channel ∈ {news, portal}` 의 `normalizedScore` 합 |
| `community_score` | topK 중 `channel = community` 합 |
| `video_score` | topK 중 `channel = video` 합 |
| `trend_signal_score` | **0 (폐기)** — v8 은 외부 트렌드 키워드 신호를 사용하지 않음 |
| `news_post_count` | `channelBreakdown.news + channelBreakdown.portal` |
| `community_post_count` | `channelBreakdown.community` |
| `video_post_count` | `channelBreakdown.video` |
| `representative_thumbnail` | 대표 썸네일 |
| `cluster_ids` | **빈 배열** — v8 은 post_clusters 테이블을 사용하지 않음 |
| `standalone_post_ids` | 클러스터 멤버 postId 전체 |
| `stable_id` | `v8-cluster-{minPostId}` (deterministic) |
| `cross_validation_score` | **0 (폐기)** |
| `cross_validation_sources` | **빈 배열 (폐기)** |
| `calculated_at` / `expires_at` | now / now+6h |

`rank_change`, `issue_rankings_history`, `momentum_score` 는 v8 파이프라인에서 갱신하지 않는다 (스키마는 유지). 동적 TTL(quiet hours 연장)도 단순화되어 고정 6h 이다.

---

## 6. Migration from v7

v7 의 8 스텝 집계 파이프라인 (`issueAggregator.ts`, ~1000 lines) 은 전부 폐기되었다.

제거된 스텝:

| v7 스텝 | 제거 사유 |
|---------|-----------|
| Step 2 buildClusterGroups (`post_cluster_members` 조회) | v8 은 k-NN 클러스터를 런타임에 계산 |
| Step 3 mergeViaTrendKeywords (trend_keywords union-find) | 외부 트렌드 키워드 매칭 자체 폐기 |
| Step 3.5 deduplicateIssuesByTitle (Jaccard ≥ 0.55) | embedding 클러스터링이 이미 동일 주제를 합침 |
| Step 4 scoreAndFilter (newsAgg + communityAgg + videoAgg + trendSignalScore + momentum×diversity×breaking) | 단일 `sumTopK × breadthBonus` 로 축약 |
| Step 5 Top N slice | cross-source≥2 + news/portal 게이트로 자연 수렴 |
| Step 7 calculateRankChanges (stableId 또는 50% 겹침 매칭) | 유지 대상 아님 — stable_id 는 deterministic 하지만 rank_change 는 기록 안 함 |

제거된 파일: `issueAggregator.ts`, `entityExtractor.ts`, `mergeArbiterWorker.ts`, 그리고 `trendSignals.ts` 의 issue 파이프라인 호출부.

제거된 설정 키 (`scoring_config.issue_aggregator` 그룹): `NEWS_WEIGHT`, `COMMUNITY_WEIGHT`, `TREND_SIGNAL_WEIGHT`, `ISSUE_DEDUP_THRESHOLD`, `DIMINISHING_K`, `MOMENTUM_WEIGHT`, `MOMENTUM_PENALTY_MIN`, `COMMUNITY_BOOST`, `DIVERSITY_CAP`, `BREAKING_KW_HALFLIFE`, `BREAKING_KW_MAX_BOOST`, `CROSS_SOURCE_2`, `CROSS_SOURCE_3`.

v8 의 튜닝 파라미터는 코드 상수로 고정되어 있다 (`RANKER_CONSTANTS`, `CLUSTERING_CONSTANTS`, `ECHO_ALPHA` 등). 런타임 오버라이드가 필요해지면 개별적으로 `scoring_config` 로 승격할 예정.

---

## 7. API 엔드포인트

`GET /api/issues` 응답 스키마는 v7 과 동일하다. 내부 SELECT 쿼리와 LRU 캐시(60s) 도 그대로. 프론트엔드 `useIssueRankings` 훅 / `IssueRankingList` 컴포넌트는 변경 없음 — 정렬은 서버 순서 그대로 표시.

```sql
SELECT * FROM issue_rankings
WHERE expires_at > NOW()
ORDER BY issue_score DESC
LIMIT $1 OFFSET $2
```

---

## 8. 파일 인덱스

| 역할 | 경로 |
|------|------|
| 파이프라인 오케스트레이션 | `backend/src/services/v8/pipeline.ts` |
| 이슈 랭커 | `backend/src/services/v8/issueRanker.ts` |
| 클러스터링 | `backend/src/services/v8/postClustering.ts` |
| Cross-channel echo | `backend/src/services/v8/crossChannelEcho.ts` |
| 통합 스코어 | `backend/src/services/v8/unifiedScoring.ts` |
| 타입 계약 | `backend/src/services/v8/types.ts` |
| 스케줄러 | `backend/src/scheduler/index.ts` |
| Issues API | `backend/src/routes/issues.ts` |
| 프론트 훅 | `frontend/src/hooks/useIssueRankings.ts` |
| DB 스키마 | `backend/src/db/migrations/037_issue_rankings.sql` |
