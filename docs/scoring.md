# 콘텐츠 랭킹 시스템

> 2026-04-11 현행. 뉴스 탭은 4항 가산 혼합 signalScore, 커뮤니티 탭은 곱셈 기반.

---

## 1. 적용 범위

스코어링은 **뉴스(news/press)와 커뮤니티(community) 소스만** 대상.
나머지 탭(영상, 핫딜, 엔터테인먼트, 여행, SNS)은 최신순(scraped_at DESC)만 표시.

---

## 2. 최종 스코어 공식

### 커뮤니티 탭

```
score = normalizedEngagement × adaptiveDecay × communitySourceWeight
      × communityVelocityBonus × clusterBonus × trendSignalBonus
      × volumeDampening
```

### 뉴스 탭 (v6 — 4항 가산 혼합 signalScore)

```
signalScore = max(
  portalRank × 0.35 + clusterImportance × 0.30
  + trendAlignment × 0.20 + engagementSignal × 0.15,
  1.0
)

score = signalScore × decay × sourceWeight × subcategoryNorm
      × breakingBoost × freshnessBonus × volumeDampening
```

**v6 변경 사항**:
1. **4번째 신호 추가**: 실제 engagement 데이터가 있는 뉴스 소스(daum_news, nate_news 등)의 참여도를 [0,10]으로 정규화하여 15% 비중 반영
2. **포털 랭킹 확장**: naver_news_ranking 외에 nate_news(×0.6), zum_news(×0.5) 순위도 portalRank에 통합
3. **소스별 뉴스 decay**: 통신사 180분, 방송 240분, 일간지 300분, 경제지 320분 차등
4. **T1 단독 속보**: 제목에 "속보/긴급" 포함 시 다중 소스 대기 없이 즉시 부스트 (최대 2.0)
5. **freshnessBonus**: 발행 30분 이내 1.3x, 1시간 이내 1.15x, 2시간 이내 1.05x

| 컴포넌트 | 범위 | 비중 | 산출 |
|----------|------|------|------|
| portalRank | [0, 10] | 35% | naver/nate/zum 뉴스 랭킹 순위 (소스별 차등 승수). 클러스터 전파 (naver ×0.8, nate/zum ×0.5). 6h 시간감쇠 |
| clusterImportance | [0, 10] | 30% | 뉴스 매체 수 (log₂ 스케일) × 티어 다양성 보너스 |
| trendAlignment | [0, 10] | 20% | trendSignalBonus [1.0,1.8] → [0,10] 선형 정규화 |
| engagementSignal | [0, 10] | 15% | 뉴스 소스 중 engagement>0인 포스트의 Z-Score 정규화 (engagement=0이면 0) |

가중치 `0.35/0.30/0.20/0.15`는 DB `scoring_config` 테이블의 `news_signal_weights` 그룹에서 런타임 오버라이드 가능.

---

## 3. 각 팩터 상세

### 3.1 정규화 참여도 (normalizedEngagement) — 커뮤니티/기타 전용

> **뉴스 탭에서는 사용하지 않음.** signalScore가 이 자리를 대체 (§2 참조).

Z-Score 정규화. 소스별 또는 채널별 통계(24시간 평균/표준편차) 기반.

```
result = max(2.0 + zViews × adjViewW + zComments × adjCommentW + zLikes × adjLikeW, 0.5)
```

- 최소 샘플 수: 뉴스 5건, 기타 10건 (미달 시 채널 통계로 폴백)
- 기본 참여도(zero-engagement 시): 2.0
- 뉴스 zero-engagement 보정: ×1.2 (참여 데이터 부재가 일반적)
- 하한: 0.5

**메트릭 완전성 보정 (v7)**:
좋아요를 수집하지 않는 소스(예: theqoo — hot 페이지에 추천수 미노출)를 자동 감지하여, 좋아요 가중치를 조회수/댓글수에 비례 재분배. 총 가중 예산은 동일하게 유지.

- 감지 조건: 소스별 통계에서 `meanLogLikes < 0.1 && stddevLogLikes ≤ 0.1` → 좋아요 미수집
- 좋아요 수집 소스: `adjViewW=1.0, adjCommentW=commentWeight, adjLikeW=likeWeight` (기존 동일)
- 좋아요 미수집 소스: `scale = (1 + commentWeight + likeWeight) / (1 + commentWeight)`, 커뮤니티 기준 scale=1.8
  - `adjViewW=1.8, adjCommentW=2.7, adjLikeW=0` (총 예산 4.5 유지)

동일 보정이 `communityVelocityToBonus`에도 적용: 좋아요 미수집 시 view/comment velocity 가중치를 7.0 총합 기준으로 비례 확대 (scale=1.75).

**채널별 댓글 가중치 (commentWeight):**

| 채널 | 가중치 | 이유 |
|------|--------|------|
| community | 1.5 | 참여 핵심 지표 |
| news | 0.5 | 댓글 비중 낮음 |
| video | 1.0 | 표준 |
| sns | 1.0 | 표준 |
| specialized | 1.0 | 표준 |

**채널별 좋아요 가중치 (likeWeight):**

| 채널 | 가중치 | 이유 |
|------|--------|------|
| community | 2.0 | 품질 지표 |
| sns | 1.5 | 확산 지표 |
| video | 1.2 | 표준 |
| specialized | 0.8 | 약한 신호 |
| news | 0.3 | 대부분 미제공 |

### 3.2 시간 감쇠 (decay)

지수 감쇠: `decay = e^(-ln(2) × ageMinutes / halfLife)`

**채널별 반감기:**

| 채널 | 반감기 | 24h 후 잔여 |
|------|--------|------------|
| sns | 120분 (2h) | 0.002% |
| community (기본) | 150분 (2.5h) | 0.06% |
| news (기본) | 240분 (4h) | 1.56% |
| specialized | 300분 (5h) | 0.46% |
| video | 360분 (6h) | 6.25% |

**뉴스 소스별 적응적 반감기 (v6):**

| 소스 그룹 | 반감기 | 사유 |
|-----------|--------|------|
| yna, newsis, naver_news_ranking | 180분 | 속보형 통신사, 빠른 순환 |
| ytn | 200분 | 속보+영상 뉴스 |
| daum_news, nate_news, zum_news, google_news_kr | 200분 | 포털 집계, 빠른 갱신 |
| sbs, kbs, mbc, jtbc | 240분 | 방송사 표준 |
| chosun, joins, donga, khan, hani | 300분 | 종합일간지, 느린 순환 |
| mk, hankyung, etnews | 320분 | 경제지, 긴 수명 |

**커뮤니티 소스별 적응적 감쇠:**

| 소스 그룹 | 반감기 | 사유 |
|-----------|--------|------|
| dcinside, fmkorea, dogdrip | 120분 | 빠른 순환 |
| theqoo, instiz, natepann, todayhumor, cook82 | 150분 | 표준 |
| ppomppu, mlbpark, inven | 180분 | 토론형 |
| clien, bobaedream | 200분 | 느린 토론형 |

### 3.3 소스 가중치 (sourceWeight)

기본값: 0.8 (미등록 소스)

| 티어 | 소스 | 가중치 |
|------|------|--------|
| T1 통신사·집계 | yna, naver_news_ranking, bigkinds_issues, youtube | 2.5 |
| T2 방송사+조중 | sbs, kbs, mbc, jtbc, chosun, joins | 2.2 |
| T3 주요 언론 | khan, mk, hani, donga, hankyung, ytn | 2.0 |
| T4 포털·통합 | daum_news(1.8), newsis(1.8), google_news_kr(1.6) | 1.6~1.8 |
| 테크 | etnews(1.5), geeknews(1.3), yozm(1.3) | 1.3~1.5 |
| 테크블로그 | naver_d2, kakao_tech, toss_tech | 1.1 |
| 커뮤니티 기본 | dcinside, bobaedream, ruliweb, theqoo, instiz, natepann, ppomppu | 1.0 |
| 영화/스포츠 | kopis_boxoffice, sports_donga | 1.2 |
| 핫딜 | ruliweb_hot, clien_jirum, quasarzone_deal, dcinside_hotdeal | 0.9 |

**커뮤니티 전용 소스별 차등 가중치 (communitySourceWeight):**

| 티어 | 소스 | 가중치 | 사유 |
|------|------|--------|------|
| A 바이럴 허브 | theqoo(1.4), instiz(1.35), natepann(1.3) | 1.3~1.4 | 자체 필터링된 인기글 |
| B 고참여 | clien(1.2), dcinside(1.15), fmkorea(1.15), todayhumor(1.1) | 1.1~1.2 | 베스트 게시판 |
| C 표준 | ppomppu, bobaedream, mlbpark, cook82, dogdrip | 1.0 | 표준 |
| D 소규모 | inven(0.9), ddanzi(0.9), humoruniv(0.85), ygosu(0.85), slrclub(0.8), etoland(0.8) | 0.8~0.9 | 트래픽 감소세 |

### 3.4 카테고리 가중치 / 서브카테고리 정규화

**카테고리 가중치 (categoryWeight):**

| 카테고리 | 가중치 |
|----------|--------|
| alert | 1.25 |
| news | 1.20 |
| trend, tech | 1.15 |
| finance | 1.10 |
| community | 1.08 |
| movie, performance, travel, music, books, ott | 1.05 |
| deals | 1.00 (기본) |
| video | 0.95 |
| government | 0.85 |
| newsletter | 0.80 |

**뉴스 서브카테고리 정규화 (subcategoryNorm):**
- 뉴스 탭에서는 고정 categoryWeight 대신 서브카테고리 내 백분위 랭크 사용
- 공식: `0.8 + 0.6 × percentileRank` → 범위 [0.8, 1.4]
- 효과: 정치 1위 기사와 연예 1위 기사가 동등하게 경쟁
- 커뮤니티 탭에서는 categoryWeight를 1.0으로 무시

### 3.5 속도 보너스 (velocityBonus) — 커뮤니티/기타 전용

> **뉴스 탭에서는 1.0 고정.** engagement 데이터 부재로 velocity 계산 불가.

`engagement_snapshots` 테이블에서 2시간 윈도우, 최소 10분 간격으로 계산.

**뉴스/기타 [1.0, 1.5]:**
```
score = log(1 + viewVelocity) + log(1 + commentVelocity) × 2.0 + log(1 + likeVelocity) × 2.5
bonus = 1.0 + min(score / 10.0, 0.5)
```

**커뮤니티 [1.0, 1.6]:**
```
score = log(1 + viewVelocity) + log(1 + commentVelocity) × 3.0 + log(1 + likeVelocity) × 3.0
bonus = 1.0 + min(score / 8.0, 0.6)
```

### 3.6 클러스터 보너스 (clusterBonus) [1.0, 3.0] — 커뮤니티/기타 전용

> **뉴스 탭에서는 1.0 고정.** signalScore의 clusterImportance로 가산 혼합에 통합됨.

동일 이슈가 여러 소스에서 보도될 때 부여.

```
rawCluster = 1.0 + 0.3 × log₂(memberCount)
categoryDiv = 1.0 + 0.1 × min(distinctCategories - 1, 3)
newsOutletDiv = newsOutletCount ≥ 3 ? 1.0 + 0.15 × min(newsOutletCount - 2, 5) : 1.0
result = min(rawCluster × categoryDiv × newsOutletDiv, 3.0)
```

### 3.7 트렌드 신호 보너스 (trendSignalBonus) [1.0, 1.8] — 커뮤니티/기타 전용

> **뉴스 탭에서는 1.0 고정.** signalScore의 trendAlignment로 가산 혼합에 통합됨.

외부 트렌드 소스(Google Trends, Naver DataLab, BigKinds, 네이트 실검, ZUM 실검, 위키백과)와 포스트 제목을 매칭.

**키워드 매칭 (2-tier):**
1. 부분문자열 매칭 (한국어 복합어 공백 무시 포함)
2. 바이그램 포함도 ≥ 70% (키워드 길이 ≥ 4일 때)

**기본 보너스 (매칭 소스 수):**

| 매칭 수 | 보너스 |
|---------|--------|
| 0 | 1.0 |
| 1 | 1.15 |
| 2 | 1.35 |
| 3+ | 1.6 |

**품질 팩터:** `0.6 + 0.4 × bestStrength`

강도(strength) 계산 기준:
- Google Trends: `min(traffic / 100,000, 1.0)`
- BigKinds: `min(article_count / 100, 1.0)`
- Naver DataLab: `min(max(change_pct, 0) / 100, 1.0)`
- 네이트/ZUM 실검: `max(0.1, 1.0 - (rank - 1) × 0.09)`
- 위키백과: `min(views / 50,000, 1.0)`

**시간 감쇠:**

| 경과 시간 | 감쇠 |
|-----------|------|
| ≤ 1h | 1.0 |
| 1~3h | 0.85 |
| 3~6h | 0.6 |
| 6~12h | 0.3 |
| > 12h | 0.0 |

**최종 계산:**
```
raw = baseBonus × qualityFactor × avgTemporalDecay
result = max(1.0, min(raw, 1.8))
```

### 3.8 속보 감지 (breakingBoost, 뉴스 전용)

**경로 1: 다중 소스 속보 (기존)**
- 클러스터 생성 2시간 이내
- 3개 이상 뉴스 소스 합류
- 30분 이내 스크래핑
- 부스트: `1.0 + 2.0 × e^(-ln(2) × minutesAge / 30)`, 상한 3.0

**경로 2: T1 단독 속보 (v6 신규)**
- T1 소스(yna, newsis, ytn) 포스트
- 제목에 "속보" 또는 "긴급" 포함
- 발행 2시간 이내
- 부스트: `1.0 + 1.0 × e^(-ln(2) × minutesAge / 30)`, 상한 2.0 (보수적)
- 다중 소스 속보가 나중에 감지되면 경로 1이 덮어씀

| 시점 | 다중 소스 (경로1) | T1 단독 (경로2) |
|------|------------------|-----------------|
| 감지 직후 | 3.0 | 2.0 |
| 30분 후 | 2.0 | 1.5 |
| 120분+ | ~1.0 | ~1.0 |

### 3.9 신선도 보너스 (freshnessBonus, 뉴스 전용, v6 신규)

외부 신호 도착 전 "사각지대" 해소. 갓 발행된 뉴스에 초기 부스트.

| 경과 시간 | 보너스 |
|-----------|--------|
| ≤ 30분 | 1.3 |
| 31~60분 | 1.15 |
| 61~120분 | 1.05 |
| > 120분 | 1.0 |

### 3.10 볼륨 감쇄 (volumeDampening)

특정 소스가 과대대표되는 것을 방지.

```
if sourceCount ≤ medianCount: dampening = 1.0
else: dampening = max(0.7, 1.0 - 0.15 × ln(sourceCount / medianCount))
```

하한: 0.7 (최대 30% 감쇄)

### 3.11 신뢰도 팩터 (credibilityFactor)

zero-engagement 게시글 보정:
- 조회/댓글/좋아요 모두 0: `credibilityFactor = 0.8`
- 클러스터에 속한 경우: `credibilityFactor = 1.15` (다중 소스 검증)
- 기본: `categoryBaseline × credibilityFactor`

---

## 4. 이슈 집계 (issueAggregator)

### 4.1 설정

| 파라미터 | 기본값 | 범위 |
|----------|--------|------|
| ISSUE_WINDOW_HOURS | 12 | 1~48 |
| MAX_ISSUES | 30 | 5~100 |
| NEWS_WEIGHT | 1.0 | 0.1~5.0 |
| COMMUNITY_WEIGHT | 0.6 | 0.0~5.0 |
| VIDEO_NEWS_WEIGHT | 1.0 | — |
| VIDEO_GENERAL_WEIGHT | 0.4 | — |
| TREND_SIGNAL_WEIGHT | 0.4 | 0.0~5.0 |
| ISSUE_DEDUP_THRESHOLD | 0.55 | 0.1~1.0 |
| DIMINISHING_K | 0.7 | 0.1~2.0 |
| MOMENTUM_WEIGHT | 0.4 | 0.0~1.0 |
| MOMENTUM_PENALTY_MIN | 0.7 | 0.5~1.0 |
| COMMUNITY_BOOST | 0.3 | 0.0~0.5 |
| DIVERSITY_CAP | 2.5 | 1.0~5.0 |
| BREAKING_KW_HALFLIFE | 30 | 10~120 |
| BREAKING_KW_MAX_BOOST | 3.0 | 1.5~5.0 |

### 4.2 이슈 스코어 공식 (v2 — 로그 체감 + 곱셈 보너스)

```
// 채널별 집계 — clusterBonus 제거 + 로그 체감
newsAgg = Σ(baseScore_i / (1 + K × ln(1+i)))      // K=0.7
communityAgg = 동일 공식
videoAgg = 동일 공식 (뉴스채널 ×1.0, 일반 ×0.4)
// baseScore = trendScore / clusterBonus (이중 적용 방지)

// 커뮤니티 동적 가중치
effectiveCW = COMMUNITY_WEIGHT + COMMUNITY_BOOST × min(communityIntensity/3, 1)

// 기본 점수 합산
rawScore = newsAgg × NEWS_WEIGHT + communityAgg × effectiveCW
         + videoAgg + trendSignalScore × TREND_SIGNAL_WEIGHT

// 곱셈 보너스
issueScore = rawScore × momentumBonus × diversityBonus × breakingKeywordBoost
```

| 컴포넌트 | 범위 | 설명 |
|----------|------|------|
| momentumBonus | [0.7, 1.8] | 최근 1h vs 이전 2h 가속도 |
| diversityBonus | [1.0, 2.5] | 소스 다양성 + 채널 교차 |
| breakingKeywordBoost | [1.0, 3.0] | "속보/긴급" 키워드, 30분 반감기 |

videoScore 계산:
- 뉴스 채널(SBS/YTN/MBC/KBS/JTBC YouTube): `trendScore × VIDEO_NEWS_WEIGHT`
- 일반 채널: `trendScore × VIDEO_GENERAL_WEIGHT`

### 4.3 채널별 탭 구성

| 탭 | 포함 소스 | 정렬 |
|----|-----------|------|
| 전체 | 모든 소스 통합 | issueScore |
| 뉴스 | news/press + 뉴스 YouTube | issueScore (뉴스 가중) |
| 커뮤니티 | community 소스만 | issueScore (커뮤니티 가중) |
| 영상 | YouTube 전체 | issueScore |
| 기타 | tech, finance, deals, government, newsletter | issueScore |

### 4.4 이슈 레벨 중복제거

- 방법: Jaccard 유사도 (바이그램)
- 임계값: 0.55 (55% 유사도 → 동일 이슈로 병합)
- Union-Find 알고리즘으로 유사 클러스터 그룹을 단일 이슈로 통합

### 4.5 모멘텀 스코어 (momentumScore)

이슈 레벨에서 최근 포스트 유입 가속도를 측정. `issue_rankings.momentum_score`에 저장.

```
acceleration = (최근 1h 포스트 수 / 1) / (이전 2h 포스트 수 / 2)
momentumScore = clamp(1.0 + MOMENTUM_WEIGHT × ln(acceleration), [MOMENTUM_PENALTY_MIN, 1.8])
```

- `momentum_score ≥ 1.5`: 프론트엔드 "급상승" 배지 표시
- `momentum_score ≤ 0.7`: TTL 2시간으로 단축 (이슈 소멸 가속)

### 4.6 TTL 및 캐싱

- 기본 TTL: 6시간
- 모멘텀 ≤ 0.7인 이슈: 2시간 (비활성 이슈 빠른 퇴출)
- KST 01:00~06:00 (야간): 07:00 KST까지 연장 (야간 빈 피드 방지)
- 순위 변동 추적: `stable_id` 매칭 또는 50%+ 클러스터/포스트 ID 겹침

---

## 5. 중복제거 (3-Layer)

| 단계 | 방법 | 용도 |
|------|------|------|
| L1 | `title_hash` MD5 (정규화: 소문자+trim+괄호/특수문자 제거) | 정확 일치 |
| L2 | Jaccard 바이그램 유사도 (임계값 0.8) | 유사 매칭 |
| L3 | Thumbnail URL 매칭 | 보조 검증 |

- 영화(movie)/공연(performance) 카테고리는 클러스터 dedup 스킵
- 결과: `post_clusters` + `post_cluster_members` 테이블에 기록

---

## 6. 설정 오버라이드

모든 스코어링 파라미터는 `scoring_config` DB 테이블에서 런타임 오버라이드 가능.

| 그룹 | 주요 파라미터 |
|------|-------------|
| `issue_aggregator` | ISSUE_WINDOW_HOURS, MAX_ISSUES, NEWS_WEIGHT, COMMUNITY_WEIGHT 등 |
| `channel_half_lives` | community(150), sns(120), news(240), specialized(300), video(360) |
| `source_weights` | T1~T4 + 기타 (기본 0.8) |
| `category_weights` | alert(1.25)~newsletter(0.80) |
| `community_source_weights` | A(1.3~1.4)~D(0.8~0.9) |
| `community_decay_half_lives` | 120~200분 소스별 |
| `engagement_weights` | 채널별 comment/like 가중치 |
| `news_signal_weights` | portal_weight(0.35), cluster_weight(0.30), trend_weight(0.20), engagement_weight(0.15) |
| `news_decay_half_lives` | 소스별 뉴스 반감기 (yna: 180 ~ mk: 320, 기본 240) |
| `trend_signal` | CAP(1.8), 키워드 길이, 시간 감쇠 |
| `breaking_news` | 감지 윈도우(2h), 최소 소스(3), 부스트 상한(3.0) |

---

## 7. 파일 구조

| 파일 | 역할 |
|------|------|
| `scoring.ts` | 배치 계산 오케스트레이션 (5분 주기) |
| `scoring-weights.ts` | 소스/카테고리/커뮤니티 가중치 + 감쇠 상수 |
| `scoring-helpers.ts` | computeScore, normalizeEngagement, velocity, cluster, breaking, portalRank, clusterImportance |
| `trendSignals.ts` | 외부 키워드 추출·매칭·보너스 계산 |
| `issueAggregator.ts` | 이슈 집계 + 채널별 순위 + 중복제거 + 모멘텀 + 동적 TTL |
| `geminiSummarizer.ts` | Gemini 이슈 요약 (pLimit(3) 병렬, fallback, stable_id 캐시) |
| `scoringConfigDefaults.ts` | DB 오버라이드용 기본값 + 범위 정의 |
