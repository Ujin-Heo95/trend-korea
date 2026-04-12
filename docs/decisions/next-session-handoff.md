# 다음 세션 핸드오프 — 2026-04-12 (저녁 2차 업데이트)

> **2026-04-12 15:00~15:45 세션 결과**: Gemini structured output 100% fallback 해소 — `gemini-2.5-flash-lite`로 모델 전환 후 fallback=0/45, avg 1.5s 정상화

## 0. Gemini 파싱 사고 처치 (이번 세션 핵심)

**증상**: TD-006 Phase 1 머지 직후 production에서 fallback=45/45 (100%). raw 250자 로그가 `{` 1글자만 보여 원인 진단 불가.

**진행 경로**:
1. `f61e89f` — raw 한 줄 로깅 + maxOutputTokens 1200→2000 + 큰따옴표 금지 prompt → **악화** (calls=0, timeouts=10, perCall 8s 초과)
2. `188b802` — perCall 8s→15s + token 2000→1500 → calls=9 회복했으나 raw가 78~312자에서 잘림. position == raw 길이로 mid-stream halt 확인 (gemini-2.5-flash + 한국어 + responseSchema 조합 SAFETY/RECITATION 추정)
3. `2546817` — `gemini-2.5-flash` → `gemini-2.0-flash` + finishReason 로깅 → **404** (`gemini-2.0-flash is no longer available to new users`)
4. `2402499` — `gemini-2.0-flash` → `gemini-2.5-flash-lite` → ✅ **정상** (calls=19, fallback=0, avg=1512ms, timeouts=0)

**최종 상태** (v110, 06:42 UTC tick):
```
[geminiSummarizer] updated 45/45 (targets=45, calls=19, timeouts=0, cache=26, fallback=0, avg=1512ms)
```

**교훈**:
- gemini-2.5-flash는 한국어 long-form + responseSchema에서 mid-stream halt가 잦음 (80자 미만에서도 halt)
- gemini-2.5-flash-lite는 thinking 비활성 + 응답 빠름(1.5s) + schema 준수도 더 높음 → structured output 용도엔 lite가 정답
- gemini-2.0-flash는 신규 API 키에 더 이상 제공되지 않음 (404)

## 1. 미해결 / 다음 세션

### 1-1. geminiLimit(3) 무력화 — 별도 PR 필요 (Critical)
`geminiSummarizer.ts:594-608`의 `for...of + await processOne()` 패턴이 `pLimit(3)`을 무력화. 외부 루프가 순차 await이라 실질 동시성 1. 지금은 fallback=0이라 증상 없지만 issue 수 늘면 phase abort 빈발. `Promise.all` 또는 worker pool 패턴으로 리팩토링 필요.

### 1-2. (이전 항목 보존 — 하단 참고)

---

> **이전 세션 결과**: PR #4 머지 + scoring CHUNK 분해 + 057/058 적용 + Gemini 핫픽스 시도 1차

---

## 1. 완료 사항

### TD-006 Phase 1 (PR #4) 머지 완료
- **머지 커밋**: `4c90034 feat(gemini): TD-006 Phase 1 — 요약 큐 + tick 분리 + 안전망 (#4)`
- 사전 작업: frontend lint 13건 + backend lint 3건 + CI postgres service 추가 (master CI 장기 방치 정상화)
- production deploy SUCCESS, scheduler `gemini summary: every 10 min (offset +2)` 정상 동작 중

### scoring.ts UPSERT 분해 (A4)
- `CHUNK 500 → 100` + 청크 사이 50ms yield (`backend/src/services/scoring.ts:255-300`)
- 효과 검증: **마이그레이션 057/058 자동 적용 성공** (lock_timeout=30s 안에 ALTER TABLE 통과)

### 마이그레이션 057 컬럼 4종 추가 확인
DB 직접 쿼리로 검증:
```
057 cols: trend_score_base, half_life_min, post_origin, decayed_at
```
어드민 페이지의 가중치 편집 / Track B decay updater 가용 상태.

### CI 워크플로우 개선
- `.github/workflows/ci.yml` backend job에 postgres:17 service container + `npm run migrate` 단계 추가
- 이전에 master CI가 장기 빨갛게 방치돼 있던 근본 원인(routes/health/db 테스트가 실 PG 필요) 해소

---

## 2. 미해결 / 진행 중

### 2-1. Gemini structured output JSON 파싱 실패 (1차 핫픽스 배포됨)

**증상**: TD-006 머지 직후 production에서 모든 이슈가 `Unterminated string in JSON at position 51-80`로 파싱 실패 → fallback_template으로 폴백. 사용자 응답 안전망은 작동하지만 Phase 1의 핵심 가치(structured output)가 무력화됨.

**1차 핫픽스** (`9439e5c fix(gemini): JSON 파싱 방어`):
- Markdown fence/BOM 제거
- JSON.parse 실패 시 첫 250자 raw text 로깅 (원인 진단용)

**다음 세션 1순위**: 핫픽스 배포 후 fly logs에서 raw text 확인 → 실제 Gemini 응답이 무엇인지 파악 → 적절한 후속 처치
- 가설 1: Gemini가 Korean 본문에 escape 안 된 큰따옴표를 포함 → JSON 깨짐 (responseSchema 강제 미준수)
- 가설 2: maxOutputTokens 1200이 응답 중간 cut-off (position 50~80은 위치가 너무 작아서 가능성 낮음)
- 가설 3: gemini-2.5-flash가 responseSchema 준수도 낮음 → gemini-2.0-flash 또는 gemini-1.5-pro 다운그레이드 검토

### 2-2. 058 v7 weights 검증 미완

`scoring_config WHERE group_name='news_signal_weights_v7'` 쿼리 결과 미확인 (gemini 핫픽스 배포로 VM 재시작 중에 ssh 끊김). 다음 세션에서 5행 존재 여부 + 어드민 페이지 표시 확인.

### 2-3. DB 풀 경합 경고 (결정 C — 이월)

production 로그에 `[db:pool] high contention — queries queued (1 total, 0 idle, 3 waiting)` 1회 발생. apiPool/batchPool 분리 효과 검증 필요. scoring 락 시간이 줄었으니 빈도는 감소했을 가능성. 24h 관찰 후 결정.

### 2-4. TD-006 Phase 2 (본문 fetch)

법무 검토 선행 필요 (`feedback_no_external_comms.md`). 통신사·일간지 원 URL만 1차 대상.

---

## 3. 검증 로그

```bash
# 057 적용 확인 (2026-04-12 14:38)
flyctl ssh console -a weeklit-backend -C "node -e \"...post_scores cols query...\""
→ 057 cols: trend_score_base, half_life_min, post_origin, decayed_at

# Production health
curl https://api.weeklit.net/health
→ {"status":"ok","db":{"connected":true}}

# CI green
gh pr view 4 --json statusCheckRollup
→ lint: SUCCESS, backend: SUCCESS, frontend: SUCCESS, Cloudflare Pages: SUCCESS
```

---

## 4. 다음 세션 시작 명령

```bash
git fetch && git checkout master && git pull
flyctl logs -a weeklit-backend --no-tail | grep "JSON.parse failed"
# raw text 250자 확인 → Gemini 응답 형식 파악

# 058 가중치 확인
flyctl ssh console -a weeklit-backend -C "node -e \"...news_signal_weights_v7 query...\""
```

---

## 5. 주의

- **`git add -u` / `git add .` 절대 금지** (`feedback_no_git_add_u.md`)
- **TD-006 Phase 2 = 법무 선행** (네이버/다음 본문 사용 가능 여부)
- **Gemini 핫픽스가 자체 해결되지 않으면** responseSchema·model 조합을 변경해야 함 — 단순 try/catch 보강만으로는 한계
