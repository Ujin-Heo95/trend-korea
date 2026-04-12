#!/usr/bin/env bash
# WeekLit deploy + post-deploy verification.
#
# 사용:  bash scripts/deploy.sh
#
# 단계:
#   1. fly deploy
#   2. legacy worker 프로세스 그룹이 있으면 0 으로 스케일 (idempotent 정리)
#   3. /health 200 + db.connected=true 가 될 때까지 폴 (max 90s)
#   4. /health 의 issue_data.age_seconds 가 600 미만으로 떨어질 때까지 폴 (max 5min)
#   5. 실패 시 비-zero exit + Discord webhook 알림
#
# 근거: 2026-04 한 달간 deploy 직후 파이프라인 freeze 사고 6건 — 매번 다른 표면
#   원인이지만 공통은 "사용자가 신고할 때까지 아무도 모름". 자동 검증으로 영속 차단.
#   `~/.claude/plans/iterative-tickling-graham.md` 참고.

set -euo pipefail

APP="${FLY_APP:-weeklit-backend}"
HEALTH_URL="${HEALTH_URL:-https://api.weeklit.net/health}"
BOOT_TIMEOUT_SEC=90
FRESHNESS_TIMEOUT_SEC=300   # 5 min
FRESHNESS_TARGET_AGE_SEC=600  # 10 min — 1 pipeline tick 안에 갱신돼야 OK
POLL_INTERVAL=10

START_TS=$(date +%s)

log()  { printf '\033[36m[deploy]\033[0m %s\n' "$*"; }
warn() { printf '\033[33m[deploy:warn]\033[0m %s\n' "$*"; }
err()  { printf '\033[31m[deploy:err]\033[0m %s\n' "$*" >&2; }

notify_discord() {
  local msg="$1"
  if [[ -n "${DISCORD_WEBHOOK_URL:-}" ]]; then
    curl -fsS -X POST -H 'Content-Type: application/json' \
      -d "$(printf '{"content":"\xf0\x9f\x9a\xa8 [deploy] %s"}' "$msg")" \
      "$DISCORD_WEBHOOK_URL" >/dev/null 2>&1 || true
  fi
}

fail() {
  err "$1"
  notify_discord "$1"
  exit 1
}

# ── Step 1: fly deploy ────────────────────────────────────────
log "fly deploy -a $APP"
if ! fly deploy -a "$APP"; then
  fail "fly deploy failed"
fi

# ── Step 2: legacy worker scale-down (idempotent) ─────────────
# 단일 프로세스 통합 이전 worker 머신이 잔재로 남아있으면 정리.
if fly status -a "$APP" 2>/dev/null | grep -q '^ worker '; then
  log "legacy worker process group detected — scaling to 0"
  fly scale count worker=0 -a "$APP" --yes 2>/dev/null || warn "worker scale=0 failed (non-fatal)"
fi

# Step 2b: app 프로세스 그룹 count=1 강제.
# 이유: in-memory pipelineLock 은 단일 머신 안에서만 직교 보장. count>=2 면
#   두 머신의 scheduler tick 이 동시에 scoring 을 발사해 DB 부하 2배 + race.
#   fly deploy 가 worker→app 마이그레이션 시 count=2 로 늘려놓는 부작용이 있었음.
app_count=$(fly status -a "$APP" 2>/dev/null | grep -c '^ app ' || echo 0)
if [[ "$app_count" -gt 1 ]]; then
  log "app process count=$app_count > 1 — scaling to 1 (in-memory lock requires single machine)"
  fly scale count app=1 -a "$APP" --yes 2>/dev/null || warn "app scale=1 failed (non-fatal)"
fi

# ── Step 3: boot wait ─────────────────────────────────────────
log "waiting for /health 200 (max ${BOOT_TIMEOUT_SEC}s)"
boot_deadline=$(( $(date +%s) + BOOT_TIMEOUT_SEC ))
boot_ok=0
while [[ $(date +%s) -lt $boot_deadline ]]; do
  body=$(curl -fsS --max-time 8 "$HEALTH_URL" 2>/dev/null || true)
  if [[ -n "$body" ]] && echo "$body" | grep -q '"connected":true'; then
    log "health 200 + db.connected=true"
    boot_ok=1
    break
  fi
  sleep 5
done
if [[ $boot_ok -ne 1 ]]; then
  fail "/health did not become healthy within ${BOOT_TIMEOUT_SEC}s"
fi

# ── Step 4: freshness wait ────────────────────────────────────
log "waiting for issue_data.age_seconds < ${FRESHNESS_TARGET_AGE_SEC} (max ${FRESHNESS_TIMEOUT_SEC}s)"
fresh_deadline=$(( $(date +%s) + FRESHNESS_TIMEOUT_SEC ))
last_age="?"
fresh_ok=0
while [[ $(date +%s) -lt $fresh_deadline ]]; do
  body=$(curl -fsS --max-time 8 "$HEALTH_URL" 2>/dev/null || true)
  # crude JSON extraction — avoids jq dependency on git-bash/Windows
  age=$(printf '%s' "$body" | sed -n 's/.*"age_seconds":\([0-9]*\).*/\1/p' | head -1)
  if [[ -n "$age" ]]; then
    last_age="$age"
    if [[ "$age" -lt "$FRESHNESS_TARGET_AGE_SEC" ]]; then
      log "freshness OK — age_seconds=$age"
      fresh_ok=1
      break
    fi
    log "age_seconds=$age (still > $FRESHNESS_TARGET_AGE_SEC, polling)"
  else
    warn "could not parse age_seconds from /health response"
  fi
  sleep "$POLL_INTERVAL"
done
if [[ $fresh_ok -ne 1 ]]; then
  fail "freshness check failed — last age_seconds=$last_age (target < $FRESHNESS_TARGET_AGE_SEC)"
fi

# ── Done ──────────────────────────────────────────────────────
ELAPSED=$(( $(date +%s) - START_TS ))
log "OK in ${ELAPSED}s"
notify_discord "deploy OK in ${ELAPSED}s (age_seconds=$last_age)"
