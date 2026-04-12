# TD-006: Gemini 요약 큐 재설계 (Round 5)

- 상태: 승인 대기
- 일자: 2026-04-12
- 부서: 개발
- 선행: TD-005 뉴스 signalScore v7 (순서 무관, 병행 가능)
- 참고: `plans/luminous-drifting-shell.md` Phase 3, `backend/src/db/migrations/056_issue_summary_cache.sql` (fingerprint 캐시 스키마 선반영 완료)

## 맥락

현 `geminiSummarizer.ts`는 10분 주기에 상위 N개 이슈 요약을 for-loop로 호출한다. 세 가지 구조 문제:

1. **예산·격리 부재** — 동기 경로(`routes/issues.ts`)는 Gemini를 호출하지 않지만, 워커 실패/타임아웃이 `aggregateIssues` 파이프라인 안에서 발생하면 후속 step(materialize)이 지연된다. `summarizeIssues`는 critical로 취급되어 실패 시 전체 주기가 흔들린다.
2. **캐시 구조 부적합** — 현 캐시 키 `stable_id + 1h TTL`은 이슈 구성원이 동일해도 1시간마다 재호출을 유발한다. 56_issue_summary_cache 마이그레이션으로 fingerprint PK는 선반영 했으나 코드 경로가 연결되지 않음.
3. **요약 입력 품질 얕음** — 제목 + snippet 수 줄만 넣어 5W1H, 배경, 인용이 누락된다. 토큰은 여유가 있다(일 $2 목표치 기준 호출당 ~1.5K 토큰 가능).

## 결정

### (A) 동기 경로 완전 격리

- `summarizeIssues`를 `aggregateIssues` 파이프라인에서 **분리된 별도 스케줄러 tick**으로 이동.
  - `scheduler/index.ts`: `aggregateAllWindows` 직후가 아닌 독립 interval(10분, offset +2분)에 실행.
  - 스케줄러 critical 재정의: `aggregateIssues`=critical / `summarizeIssues`=non-critical.
- 워커 전체 phase 타임아웃 **90초** + 개별 Gemini 호출 타임아웃 **8초** (`AbortController`).
- 타임아웃·쿼터 초과 시 남은 이슈는 `fallback_template`으로 즉시 채우고 phase 종료:
  - fallback = `"{대표 제목} — {상위 1개 포스트의 첫 문장(80자 clamp)}"` (rule-based, 0ms).
- 사용자는 `/api/issues` 응답에서 `summary` 필드가 비어있는 상태를 **절대 보지 않는다** (카오스 테스트로 검증).

### (B) Priority queue 도입 — `summaryQueue.ts`

```
priority = issueScore
         × freshnessFactor           # 신규 이슈 우선 (6h 반감기)
         × unsummarizedPenalty       # 요약 안 된 이슈일수록 높음 [1.0, 3.0]
         × noveltyFactor             # 구성원 변경률 ≥0.3이면 1.2, 아니면 1.0
```

- 큐는 `aggregateIssues` 종료 직후 rebuild.
- 워커는 예산 잔량 없이 그냥 우선순위대로 pull — 실제 비용 통제는 **(D) fingerprint 캐시 hit rate**로 자연 수렴.
- 파라미터는 `scoring_config.summary_queue` 그룹에서 런타임 오버라이드.

### (C) Structured output + 본문 fetch

- Gemini `responseMimeType: 'application/json'` + `responseSchema`로 구조화 출력 강제:
  ```ts
  {
    headline: string,      // 40자 이내
    one_liner: string,     // 80자 이내, 요체 어미
    bullets: string[3],    // 각 60자 이내, 5W1H 중심
    sentiment: 'positive' | 'negative' | 'neutral',
    category: string
  }
  ```
- 입력: 제목 + snippet 대신 **상위 1~2개 뉴스 포스트 본문 최대 2KB**.
- 본문 fetch (`summaryExtraction.ts` 신규):
  - 개별 타임아웃 3초, 도메인별 동시성 2 (`p-limit`).
  - cheerio 셀렉터 fallback chain: `article.article_view` → `.article_body` → `#articleBody` → `main article` → `body` (뒤쪽일수록 low-quality).
  - 실패 시 snippet-only 경로로 폴백 (**요약 호출 자체는 진행**).
  - `scraper_circuit_breakers` 테이블 재사용: 실패율 > 0.5 도메인은 30분 skip.
- 비용 추정: 이슈당 입력 ~1500 토큰, 호출당 ~$0.0013. 일 목표 $2 기준 최대 ~1500회 호출, 실제는 캐시로 400~700회 수렴.

### (D) fingerprint 캐시 활용 — 056 스키마 연결

현재 `056_issue_summary_cache.sql`는 존재하지만 코드가 읽지 않는다. 본 Round에서 연결:

- `content_fingerprint = md5(sorted top-5 post_ids + 대표 제목)`
- 요약 호출 전 fingerprint로 캐시 조회 → hit 시 재호출 없이 `issue_rankings`에 UPSERT.
- miss 또는 구성원 변경률 ≥ 0.3일 때만 Gemini 호출.
- 캐시 TTL은 없음 — `issue_rankings` expired 시 cache row는 `hit_count` 기반 LRU prune (일 1회 cron).
- 예상 hit rate ≥ 0.5 (warmup 이후). < 0.3으로 떨어지면 Discord 알림 (이슈 변동 폭주 또는 fingerprint 키 결함 신호).

### (E) 관측성

`pipelineHealth.ts`에 메트릭 추가:

- `gemini_calls_today`, `gemini_avg_latency_ms`, `gemini_timeout_count`
- `summary_cache_hit_rate`
- `summary_fallback_rate` (fallback_template 사용 비율)
- `article_fetch_fail_rate_by_domain`

Discord 일일 리포트 09:00 KST: 어제 호출 수 + 추정 비용. 예산 초과 시 알림만, 자동 차단 없음.

Discord 즉시 알림 조건:
- `summary_cache_hit_rate` < 0.3
- `gemini_timeout_count` > 5 per tick
- `summary_fallback_rate` > 0.5

## 영향 파일

**수정**:
- `backend/src/services/geminiSummarizer.ts` — structured output, fingerprint 캐시, AbortController 타임아웃, fallback 경로
- `backend/src/scheduler/index.ts` — 요약 tick 분리, critical 재정의
- `backend/src/services/pipelineHealth.ts` — 메트릭 확장
- `backend/src/routes/issues.ts` — fallback summary가 비었을 때 즉시 rule-based 생성 (캐시된 요약 없을 경우 대비)
- `docs/issue_ranking.md`, `docs/scoring.md` — Gemini 경로 설명 갱신

**신규**:
- `backend/src/services/summaryQueue.ts` — priority queue 구현
- `backend/src/services/summaryExtraction.ts` — 본문 fetch (타임아웃/circuit breaker/동시성 제한)
- `backend/tests/services/summaryQueue.test.ts`
- `backend/tests/services/summaryExtraction.test.ts` — 타임아웃/도메인 격리 시나리오
- `backend/tests/services/geminiSummarizer.fingerprint.test.ts` — 캐시 hit/miss/변경률 경로

**재사용**:
- `p-limit` (이미 사용 중)
- `lru-cache` (summaryQueue 인메모리 보조)
- `scraper_circuit_breakers` 테이블

## 작업 순서 (추정 5~6h)

1. `summaryExtraction.ts` — 본문 fetch + 타임아웃 + circuit breaker (단독 테스트 가능)
2. `summaryQueue.ts` — priority 공식 구현 + 단위 테스트
3. `geminiSummarizer.ts` 재작성:
   - fingerprint 캐시 조회/기록 (`issue_summary_cache` 테이블)
   - structured JSON 출력 + responseSchema
   - AbortController 개별 타임아웃 8s
   - fallback_template 경로
4. `scheduler/index.ts` — tick 분리 + critical 재정의
5. `routes/issues.ts` — summary 빈 값 시 rule-based 즉시 생성 (안전망)
6. 카오스 테스트: 워커에서 sleep 100s + exception 주입 → `/api/issues` 응답 정상성 확인
7. 1일 shadow 모니터링 → Discord 호출 수/hit rate/fallback rate 확인
8. 문서 갱신

## 결과 (예상)

- (+) 사용자 응답 경로가 Gemini 상태와 완전 분리 (5xx 전파 0)
- (+) 캐시 hit rate ≥ 50%로 이슈당 평균 호출 12회 → 2~3회 (75% 절감)
- (+) Structured output으로 요약 품질·일관성 상승, 프론트 바인딩 단순화
- (+) 본문 fetch로 5W1H 포함률 향상
- (−) 본문 fetch 법적 리스크 — 1차 릴리즈는 뉴스사 원 URL만 대상, 네이버/다음 뉴스 본문 제외
- (−) 셀렉터 fallback chain 유지보수 부담 (장기적으로 `@mozilla/readability` 도입 검토)
- (−) 비용 관측 수동 (예산 회계 테이블/라우터는 본 Round 범위 외)
- 롤백: feature flag `summary.v2_pipeline` OFF → 기존 경로 복귀. 056 테이블은 read-only로 유지.

## 열린 질문

1. **본문 fetch 대상 제한** — 네이버/다음 뉴스 허용 여부를 법무 재확인 필요. 1차는 원 URL(통신사·방송·일간지 홈페이지)만.
2. **readability vs 커스텀 셀렉터** — `@mozilla/readability` 추가 시 번들 크기 +40KB. 정확도 향상 폭 측정 후 결정.
3. **Gemini 모델 선택** — 현재 `gemini-2.5-flash`. 본문 2KB 입력 환경에서 `flash-lite`로 다운그레이드 시 품질 저하 폭 측정 (비용 -60% vs 품질).
