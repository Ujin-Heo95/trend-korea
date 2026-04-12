# TD-005: 뉴스 signalScore v7 — freshness 흡수 + entity 기반 clusterImportance

- 상태: 승인 대기 (Round 3 "뉴스 v7" 선행 작업, Round 4 임베딩 dedup 이후 실행)
- 일자: 2026-04-12
- 부서: 개발
- 선행: TD-006 임베딩 단일화 (Round 4, 2026-04-12 a007fba 완료)

## 맥락

현 뉴스 탭 공식 v6은 4항 가산 signalScore + 외부 승수 6종 곱셈이다(`scoring.md` §2).

```
signalScore = max(portalRank×0.35 + clusterImportance×0.30
              + trendAlignment×0.20 + engagementSignal×0.15, 1.0)

score = signalScore × decay × sourceWeight × subcategoryNorm
      × breakingBoost × freshnessBonus × volumeDampening
```

두 가지 구조 문제가 있다.

1. **freshnessBonus 이중 계산** — 소스별 decay halfLife(180~320분)는 이미 신선도를 반영한다. 그 위에 `freshnessBonus`(30분 1.3x / 1h 1.15x / 2h 1.05x)를 곱하면 같은 시간 축을 두 번 가산한다. 특히 halfLife가 짧은 통신사(180분)는 30분 지점에서 decay만 0.89인데 freshnessBonus 1.3x가 추가로 붙어 스파이크가 과장된다.
2. **clusterImportance의 매체 수 비례 과잉 보상** — `뉴스 매체 수 × log₂ 티어 다양성`은 같은 엔티티(인물/조직)를 여러 각도로 다룬 기사에서 동일 엔티티를 반복 계산한다. 예: "이재명 발언"을 10개 매체가 서로 다른 헤드라인으로 보도하면 clusterImportance가 상한(10)에 닿지만 정보량은 1.5~2건 수준.

## 결정

### (A) freshness를 signalScore 5번째 항으로 흡수

```
signalScore = max(
  portalRank × 0.32 + clusterImportance × 0.27
  + trendAlignment × 0.18 + engagementSignal × 0.13
  + freshnessSignal × 0.10, 1.0
)

score = signalScore × decay × sourceWeight × subcategoryNorm
      × breakingBoost × volumeDampening
```

- 외부 승수에서 `freshnessBonus` **제거** (소스별 decay에 이미 반영됨).
- `freshnessSignal` [0, 10] 산출: 발행 시각 기준 연속 함수 `10 × exp(-ln2 × ageMinutes / 45)`. 45분 반감기.
  - 30분 → 6.3 / 60분 → 4.0 / 120분 → 1.6 — 기존 임계값 기반 1.3/1.15/1.05 스텝과 유사한 상위권 분포를 유지하면서 경계선 노이즈 제거.
- 가중치 재정규화: 기존 4항 비중을 `0.32/0.27/0.18/0.13` (총 0.9)로 축소 + freshness 0.10 추가. 합계 1.0 유지.
- DB 그룹 키: `news_signal_weights` → `news_signal_weights_v7`. `scoring_config` 마이그레이션으로 기본값 선언.

### (B) entity 기반 clusterImportance

- 현 `매체 수 × 티어 다양성` 대신 **임베딩 클러스터의 "서로 다른 사건 단위"를 추정**.
- 산출 방식:
  1. 클러스터 내 포스트의 임베딩(Round 4에서 생성 중인 `post_embeddings`) 평균을 centroid로 계산.
  2. 각 포스트 임베딩과 centroid의 코사인 거리를 합산 → **평균 거리 d_avg** (0=동일, 1=직교).
  3. `clusterImportance = log₂(1 + uniqueOutlets) × (1 + d_avg × 2)`
     - uniqueOutlets: 현재와 동일 (티어 다양성 보너스 유지)
     - d_avg 승수는 최대 +3까지만 (상한 clamp)
  4. [0, 10] 범위로 clamp.
- 효과: 같은 사건을 반복 보도한 클러스터는 d_avg가 낮아 clusterImportance가 억제되고, 서로 다른 각도(사실/반응/분석/후속)를 다룬 클러스터는 d_avg가 높아 가중.
- 의존성: Round 4 임베딩 생성이 전 포스트에 대해 안정적으로 동작해야 함. 임베딩 부재 시 기존 `매체 수 × 티어` 공식으로 fallback (feature flag `scoring.news.entity_cluster_v7`).

### (C) 가중치 튜닝 절차

- 1주일간 production에서 v6와 v7을 병행 기록 (feature flag OFF 상태에서 v7 산출만 로그).
- `pipelineHealth`에 `news_score_v6_v7_delta_pct` 메트릭 추가.
- Top30 일치율 ≥ 70%, 사용자 피드백 없을 경우 flag ON 전환.

## 영향 파일

- `backend/src/services/scoring.ts` — signalScore 산출부 (현 169-201행)
- `backend/src/services/scoring-helpers.ts` — `freshnessBonus` 제거 (또는 내부 전용으로 격리)
- `backend/src/services/scoring-weights.ts` — `news_signal_weights_v7` 디폴트
- `backend/src/services/scoringConfigDefaults.ts` — 신규 그룹 등록 + feature flag
- `backend/src/db/migrations/057_news_signal_v7.sql` — `scoring_config` 신규 키 INSERT ON CONFLICT
- `backend/src/services/pipelineHealth.ts` — v6/v7 delta 메트릭
- `docs/scoring.md` — v6 → v7 라벨 + 공식 교체
- `docs/issue_ranking.md` — §3 개별 포스트 스코어링 요약 동기화

## 작업 순서 (추정 3~4h)

1. feature flag `scoring.news.entity_cluster_v7`, `scoring.news.signal_v7` 추가 (기본 OFF).
2. `scoring-helpers.ts`에 `freshnessSignal(ageMinutes)` + `clusterImportanceFromEmbeddings()` 순수 함수 신규 작성.
3. `scoring.ts`에서 flag에 따라 v6/v7 분기. v7은 외부 `freshnessBonus` 승수를 1.0 고정.
4. 단위 테스트:
   - `freshnessSignal` 연속성 (30/60/120분 기대값)
   - `clusterImportance` 동일 사건 10건 vs 다각도 10건 비교 (후자 > 전자)
   - v6/v7 전환 시 Top30 일치율 ≥ 0.7 시뮬레이션
5. `057_*.sql` 마이그레이션 + scoringConfig 로더 확장.
6. 1주일 shadow 로깅 → flag ON.
7. `docs/scoring.md` + `docs/issue_ranking.md` 동기화, `CLAUDE.md` Current Phase bump.

## 결과

- (+) freshness 이중 계산 제거로 halfLife 짧은 소스의 30분 스파이크 완화
- (+) entity 반복 보도의 clusterImportance 억제 → "대형 단일 사건"이 dominant해지는 현상 완화
- (+) 외부 승수 6개 → 5개로 단순화 (volumeDampening은 유지)
- (−) 임베딩 생성 의존성 추가 — Round 4 안정성이 전제
- (−) 가중치 재튜닝 부담 (1주일 shadow 기간 필요)
- 롤백: feature flag 2개 OFF로 v6 공식 복귀 (마이그레이션은 forward-only)
