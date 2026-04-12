# Runbook — 종합 탭 stale (이슈 데이터 갱신 중단)

## 증상

사용자가 weeklit.net 종합 탭을 새로고침해도 이슈 카드의 갱신 시각(`기준: HH:MM 업데이트`)이 변하지 않는다. 5번 재발한 사고 클래스.

## 재발 이력 (영구 보존)

| # | 일자 | 직접 원인 | 수정 커밋 |
|---|------|---------|----------|
| 1 | 2026-04-?? | DB 풀 공유 (apiPool/batchPool) → 종합 탭 쿼리 freeze | 80ba373, 44bd200 |
| 2 | 2026-04-?? | Pipeline advisory lock stale → tick 무한 skip | 705dc72 |
| 3 | 2026-04-?? | Supavisor session-level lock 호환 불가 | 705dc72 |
| 4 | 2026-04-?? | Service Worker `stale-while-revalidate` → 사용자 영원히 1단계 stale | cacc41e |
| 5 | 2026-04-12 | HTTP `Cache-Control: stale-while-revalidate=60` (#4 와 동일 패턴, 다른 레이어) | (이번) |

**공통 패턴:** 백엔드 API 단독 호출은 fresh, 그러나 사용자 화면은 stale. 매번 다른 캐시/락 레이어.

---

## 진단 순서 (5분 내)

각 단계는 그 자체로 layer 1개를 확정/제외한다.

### 1. 데이터 자체가 stale 인가?
```bash
# /health 는 항상 200 (Fly liveness 전용). 신선도 SLO 는 별도 엔드포인트.
curl -sD - https://weeklit-backend.fly.dev/health/freshness
# 기대: HTTP 200 + { "status": "ok", "issue_data": { "is_stale": false } }
# HTTP 503 + "is_stale": true 면 → 파이프라인 문제 (단계 5 로)
# UptimeRobot 는 이 엔드포인트(/health/freshness)를 봐야 함, /health 아님.
```

> **사고 교훈 (2026-04-12)**: `/health` 에 SLO 503 을 묶으면 Fly machine
> healthcheck 가 critical 잡고 라우팅 차단 → 사용자 다운. 신선도 신호는
> 반드시 별도 path 로 분리.

### 2. API 응답에 freshness 가 fresh 한가?
```bash
curl -sD - https://weeklit.net/api/issues?window=12h -o /dev/null | grep -i "x-data-"
# 기대: x-data-age-seconds < 900, x-data-stale: 0
```
- 헤더 보임 → freshness 계약 정상. CDN/SW 문제일 가능성 (단계 3)
- 헤더 없음 → 신규 freshness 메타가 안 붙음 → 배포 누락 (단계 4)

### 3. CDN/브라우저 캐시가 stale 잡고 있는가?
```bash
curl -sD - https://weeklit.net/api/issues?window=12h -o /dev/null | grep -i "cache-control\|cf-cache"
# 기대: cache-control: no-cache, no-store, must-revalidate
# cf-cache-status 가 HIT 이면 → CDN 캐시 문제 (purge 필요)
```
- `max-age` 값이 60/300/etc 보임 → `backend/src/server.ts:131` 정책이 회귀됨. 즉시 PR.

### 4. 배포 자체가 누락됐는가?
```bash
fly status -a weeklit-web | head
fly releases -a weeklit-web | head -5
# 최신 commit hash 가 production 에 있는지 확인
```

### 5. 파이프라인이 멈췄는가?
```bash
curl -s "https://weeklit.net/health?admin_token=$ADMIN_TOKEN" | jq .issue_data,.issues_cache
# issues_cache.last_clear_at 가 10분 이내 인가?
# 아니면 → worker 프로세스 장애
fly logs -a weeklit-web --process-group worker | tail -100
# scheduler tick 에러, batchPool 에러, mutex stuck 메시지 검색
```

### 6. DB 자체에 데이터가 있는가?
```sql
-- Supabase SQL editor 에서
SELECT MAX(calculated_at), NOW() - MAX(calculated_at) AS age
FROM issue_rankings WHERE expires_at > NOW();
-- age > 15분 이면 aggregateIssues 가 안 도는 것
```

---

## 원인별 해결

| 단계 | 원인 | 해결 |
|------|------|------|
| 3 | CDN 캐시가 stale 헤더 회귀 | `server.ts:131` 정책 점검, `fly deploy` |
| 3 | Cloudflare 캐시 HIT 잔재 | `https://dash.cloudflare.com/...purge` |
| 4 | 배포 누락 | `git push` + `fly deploy` 재시도 |
| 5 | worker 프로세스 죽음 | `fly machines restart -a weeklit-web --process-group worker` |
| 5 | mutex stuck | worker 재시작 (in-memory mutex 는 프로세스 재기동 시 자동 해제) |
| 6 | DB 풀 freeze | `db/client.ts` 의 batchPool 헬스체크. 필요시 worker 재시작 |

---

## 영구 가드 (현재 코드 기준)

이 가드들이 살아 있는 한 5번째와 동일 클래스 재발은 사용자 신고 없이 감지된다.

1. **`/health` SLO 503**: `routes/health.ts` 의 `issue_data.is_stale` → HTTP 503. UptimeRobot 가 즉시 잡음.
2. **`pipelineHealth.ts`**: `MAX(calculated_at)` 20분 초과 시 Discord alert (기존).
3. **API freshness 메타**: `routes/issues.ts` 의 `freshness.is_stale` → 프론트가 자동 invalidate, 사용자에게 노란 배너.
4. **`materializeResponse` 알람 승격**: `scheduler/index.ts` 의 catch 가 silent → `notifyPipelineWarning` 로 변경.
5. **Cache invalidation 텔레메트리**: `getIssuesCacheTelemetry()` — 마지막 clear 사유와 시각이 admin `/health` 에 노출.
6. **Cache-Control no-store**: `server.ts:131` `/api/issues*` `/api/posts*` 는 절대 캐시되지 않음. 회귀 시 단계 3 로 즉시 발견.

**금지 사항 (영원히):**
- `/api/issues*` 에 `s-maxage` 또는 `stale-while-revalidate` 추가 (사고 #4, #5 의 직접 원인)
- React Query `staleTime > 0` for `issue-rankings` 키 (version 폴링 invalidation 신호 무력화)
- `clearIssuesCache()` 호출 시 reason 인자 누락 (사후 디버깅 불가)
