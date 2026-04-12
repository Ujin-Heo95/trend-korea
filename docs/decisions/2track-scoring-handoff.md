# 2-Track 증분 스코어링 — 별도 세션 핸드오프

> **상태**: 설계 완료, 미착수. 별도 세션에서 단독 PR로 진행 권장.
> **작성**: 2026-04-12 (조사 라운드 3 결과 정리)
> **선행 컨텍스트**: signalScore v7 PR#1 (커밋 `55db6c5`), Gemini 캐시 통합 (`bde74b7`)

## 배경 / 동기

현재 스코어링은 매 10분 배치마다 24h 윈도 **전체 재계산**. Supabase egress·Fly.io CPU 비용 증가 추세. 2-track 분리로 부하 분산 + 신선도 유지가 목표.

- **Track A** (신규 스코어링, 15분): 신규/변경 post만 풀 스코어링
- **Track B** (decay-only inplace, 10분): 기존 post의 시간감쇠만 SQL UPDATE 한 방

회귀 리스크 큼 → **반드시 단독 PR + feature flag + staging A/B** 권장.

---

## 현재 구조 (조사 결과)

| 역할 | 파일:라인 |
|---|---|
| 배치 진입점 (cron `*/10`) | `backend/src/scheduler/index.ts:67-91` |
| 전체 재계산 함수 | `backend/src/services/scoring.ts:61-301` (`_calculateScores`) |
| Round1 6 집계쿼리 (sourceStats/channelStats/velocityMap/clusterBonusMap/categoryBaselines + 24h posts SELECT) | `scoring.ts:87-124` |
| Round2 6 (trendSignalMap/subcategoryPercentiles/breakingNews/portalRank/clusterImportance/newsEngagement) | `scoring.ts:130-137` |
| 500행 청크 UPSERT | `scoring.ts:249-273` |
| 이슈 집계 (스코어 소비자) | `backend/src/services/issueAggregator.ts` (1244줄) |
| 파이프라인 래퍼 | `backend/src/services/pipeline.ts` (86줄, 로깅·리트라이) |

**병목**: 24h 윈도 전체가 매 사이클 대상. velocity/cluster/portal 맵은 크로스-post 의존이라 모집단 전체 필요.

---

## 데이터 경계 (Track A vs Track B)

`post_scores` 테이블 (migration 007/036) 기준:

**Track A 산출 (신규 스코어링)**
- `trend_score_base` ← *신규 컬럼*: decay 미적용 raw 점수
- `source_weight`, `category_weight`, `velocity_bonus`, `cluster_bonus`, `trend_signal_bonus`
- 집계·신호 의존. 신규 post 또는 engagement Δ가 임계치 초과한 post만 대상.

**Track B 산출 (decay-only)**
- `trend_score` ← 호환 유지: `trend_score_base × exp(-ln2 × age/halfLife)`
- `decayed_at` ← *신규 컬럼*: decay 갱신 시각
- 전 24h posts 대상 **순수 SQL UPDATE 한 방**. 다른 집계쿼리 의존 없음.

핵심 원칙: decay는 시간만의 함수이므로 DB-side로 이관 가능. Track A만이 무거운 집계(`calculateSourceStats`, `velocityMap`, `clusterBonusMap`, `trendSignalMap`)를 돌린다.

---

## 마이그레이션 057

```sql
ALTER TABLE post_scores
  ADD COLUMN IF NOT EXISTS trend_score_base DOUBLE PRECISION,  -- Track A 산출
  ADD COLUMN IF NOT EXISTS half_life_min    INTEGER,           -- Track A 결정 halfLife
  ADD COLUMN IF NOT EXISTS post_origin      TIMESTAMPTZ,       -- published_at 폴백
  ADD COLUMN IF NOT EXISTS decayed_at       TIMESTAMPTZ;

-- 백필: 기존 trend_score → trend_score_base, posts 조인으로 post_origin 채우기
UPDATE post_scores ps
   SET trend_score_base = ps.trend_score,
       post_origin = COALESCE(p.published_at, p.first_scraped_at, p.scraped_at)
  FROM posts p
 WHERE ps.post_id = p.id AND ps.trend_score_base IS NULL;
```

`trend_score`는 호환 유지 — 기존 쿼리는 계속 읽되 Track B가 매 10분 UPDATE.
**중요**: `migrate.ts` 배열에 `'057_2track_scoring.sql'` 등록 잊지 말 것 (056 누락 사례 재발 방지).

---

## 단계별 구현 (회귀 리스크)

1. **스키마 + 백필 마이그레이션** (low) — 기존 배치 동작 유지.
2. **Track B decay-updater 서비스** (low-med) — `services/scoring/decay.ts` 신설.
   ```sql
   UPDATE post_scores
      SET trend_score = trend_score_base * exp(-ln(2) * 
          EXTRACT(EPOCH FROM (NOW() - post_origin)) / 60 / half_life_min),
          decayed_at = NOW()
    WHERE post_origin > NOW() - INTERVAL '24 hours';
   ```
   - 채널/소스별 halfLife는 Track A가 결정해 `half_life_min` 컬럼에 저장 → Track B는 단일 SQL.
   - `scoring_track_b_enabled` feature flag 뒤에 둠.
3. **Track A를 ids-limited로 리팩터** (med) — `_calculateScores` → `calculateScoresForIds(ids)`
   - 신규 기준: `first_scraped_at > last_run` 또는 engagement Δ ≥ 임계
   - velocity/cluster/portal 맵은 **전체 24h 모집단**으로 계산 (크로스-post 의존)
   - **⚠️ 핵심 함정**: rawScoreEntries 볼륨 감쇄 (`scoring.ts:234-243`)가 전수 모집단에 의존. Track A 한정 모집단에서 분모가 왜곡됨.
   - **대응**: 소스별 24h post count는 별도 SELECT로 선-계산해 분모 공급.
4. **스케줄러 분기** (med) — 
   - cron `*/15`: Track A + aggregateIssues
   - cron `*/10` (offset +3분): Track B만
   - 이슈 집계는 Track A 사이클에만 붙임
   - **위험**: 이슈 랭킹이 Track B decay 변화를 15분까지 못 봄 → `materializeResponse`에 경량 re-rank 경로 추가
5. **레거시 폐기** (low) — 기존 단일 경로를 `scoring_track_legacy` flag로 두고 staging 검증 후 제거

---

## A/B 측정 지표 (staging 필수)

**파이프라인 비용**
- p50/p95 소요시간 (`pipelineHealth.ts`)
- DB CPU, Supabase egress / row-read 카운트
- Vercel/Fly function-sec

**스코어 동치성** (Track A+B vs legacy 전수 재계산)
- top-100 Kendall-τ
- Jaccard@50
- 이슈 순위 Spearman
- `trend_score` 절대오차 p95

**드리프트**
- `aggregateIssues` 결과 셋의 insert/remove rate
- 신선도 지연: 신규 post → 첫 score 시간 (현 10분 → 목표 ≤15분 유지)

---

## PR 분리 + Feature Flags

| PR | 내용 | Flag |
|---|---|---|
| #1 | 057 마이그레이션 + 백필 | (없음, non-breaking) |
| #2 | Track B decay-updater | `scoring_track_b_enabled` |
| #3 | Track A ids-limited 리팩터 + 스케줄러 분기 | `scoring_incremental_enabled` |

**롤백 전략**: 두 flag OFF → 기존 `calculateScores` 경로 즉시 복구. 컬럼은 DROP하지 않고 유지 (역호환).

Feature flag 인프라는 이미 `backend/src/services/featureFlags.ts` + `scoring_config` 테이블에 있음 (migration 041).

---

## Critical Files

```
backend/src/services/scoring.ts             # 핵심 리팩터 대상
backend/src/services/scoring-helpers.ts     # 집계 헬퍼
backend/src/services/scoring-weights.ts     # halfLife 정의
backend/src/scheduler/index.ts              # cron 분기
backend/src/services/issueAggregator.ts     # 이슈 집계 소비자
backend/src/db/migrations/036_score_breakdown.sql   # 기존 컬럼 참고
backend/src/db/migrate.ts                   # 057 등록 (누락 주의!)
backend/src/services/featureFlags.ts        # flag 인프라
```

---

## 별도 세션 시작 방법

```
1. 새 세션 시작
2. 이 문서 (`docs/decisions/2track-scoring-handoff.md`) 먼저 Read
3. 위 Critical Files 순서대로 파악
4. PR #1 (마이그레이션 + 백필)부터 단계적 구현
5. 각 PR마다 staging A/B 지표 확인 후 다음 단계
```

**선행 작업 확인**:
- ✅ Gemini 캐시 통합 (`bde74b7`) — 056 등록 사례에서 migrate.ts 누락 패턴 학습
- ✅ signalScore v7 PR#1 (`55db6c5`) — freshness smooth decay 흡수
- ⏳ signalScore v7 PR#2 (가중치 튜닝, 데이터 보고 결정) — 2-track과 독립

**경고**: 2-track은 1주 이상 staging 운영 권장. 프로덕션 직행 금지.
