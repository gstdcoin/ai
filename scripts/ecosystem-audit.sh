#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# GSTD full ecosystem audit — automates .agents/workflows/audit.md
# Exit 0 = all critical checks passed; 1 = at least one critical failure.
#
# Usage:
#   ./scripts/ecosystem-audit.sh              # full audit (production URLs)
#   ./scripts/ecosystem-audit.sh --local-only # skip public HTTPS checks (dev box)
#
# Env:
#   GSTD_BACKEND_CONTAINER  default ubuntu-backend-blue-1
#   SKIP_EXTERNAL=1         same as --local-only
# ═══════════════════════════════════════════════════════════════
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

LOCAL_ONLY=0
if [[ "${1:-}" == "--local-only" ]] || [[ "${SKIP_EXTERNAL:-}" == "1" ]]; then
  LOCAL_ONLY=1
fi

if [[ -f "$REPO_ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$REPO_ROOT/.env"
  set +a
fi

BACKEND_CONTAINER="${GSTD_BACKEND_CONTAINER:-ubuntu-backend-blue-1}"
FAILURES=0
WARNINGS=0

pass() { printf '[OK]   %s\n' "$*"; }
fail() { printf '[FAIL] %s\n' "$*" >&2; FAILURES=$((FAILURES + 1)); }
warn() { printf '[WARN] %s\n' "$*" >&2; WARNINGS=$((WARNINGS + 1)); }
note() { printf '[NOTE] %s\n' "$*"; }
section() { printf '\n── %s ──\n' "$*"; }

# --- 1. Containers ---
section "1. Docker containers"
if docker ps -a --format "table {{.Names}}\t{{.Image}}\t{{.Status}}" 2>&1; then
  pass "docker ps listing"
else
  fail "docker ps failed"
fi

# --- 2. Backend health ---
section "2. Backend health (in-container)"
if docker inspect "$BACKEND_CONTAINER" &>/dev/null; then
  HEALTH_RAW=$(docker exec "$BACKEND_CONTAINER" wget -qO- http://localhost:8080/api/v1/health 2>&1) || HEALTH_RAW=""
  if echo "$HEALTH_RAW" | python3 -m json.tool &>/dev/null; then
    pass "backend $BACKEND_CONTAINER /api/v1/health JSON valid"
    echo "$HEALTH_RAW" | python3 -m json.tool 2>/dev/null | head -20
  else
    fail "backend health invalid or unreachable: ${HEALTH_RAW:0:200}"
  fi
else
  fail "container not found: $BACKEND_CONTAINER"
fi

# --- 3. External endpoints ---
if [[ "$LOCAL_ONLY" -eq 0 ]]; then
  section "3. Public HTTPS endpoints"
  URLS=(
    "https://app.gstdtoken.com"
    "https://app.gstdtoken.com/api/v1/health"
    "https://app.gstdtoken.com/api/v1/stats/public"
    "https://app.gstdtoken.com/api/v1/nodes/list"
    "https://gstdtoken.com"
  )
  for url in "${URLS[@]}"; do
    code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$url" || echo "000")
    if [[ "$code" == "200" ]]; then
      pass "$code $url"
    else
      fail "$code $url"
    fi
  done
else
  section "3. Public HTTPS endpoints (skipped --local-only)"
fi

# --- 4. Database ---
section "4. PostgreSQL"
PG_CONTAINER=$(docker ps --filter "ancestor=postgres:15-alpine" --format "{{.Names}}" | head -1)
if [[ -n "$PG_CONTAINER" ]]; then
  if docker exec "$PG_CONTAINER" psql -U postgres -d distributed_computing -c "
SELECT 'nodes' as metric, COUNT(*) as total, COUNT(*) FILTER(WHERE status='online' AND last_seen > NOW()-INTERVAL '5 min') as active FROM nodes
UNION ALL
SELECT 'users', COUNT(*), 0 FROM users
UNION ALL
SELECT 'tasks', COUNT(*), COUNT(*) FILTER(WHERE status='completed') FROM tasks;" 2>&1; then
    pass "database query ok ($PG_CONTAINER)"
  else
    fail "database query failed"
  fi
else
  fail "no postgres:15-alpine container found"
fi

# --- 5. Redis ---
section "5. Redis"
REDIS_CONTAINER=$(docker ps --filter "ancestor=redis:7-alpine" --format "{{.Names}}" | head -1)
if [[ -z "$REDIS_CONTAINER" ]]; then
  fail "no redis:7-alpine container found"
else
  if [[ -z "${REDIS_PASSWORD:-}" ]]; then
    warn "REDIS_PASSWORD not set — trying ping without auth"
    if docker exec "$REDIS_CONTAINER" redis-cli ping 2>/dev/null | grep -q PONG; then
      pass "redis ping ($REDIS_CONTAINER)"
    else
      fail "redis ping failed (set REDIS_PASSWORD in .env if auth required)"
    fi
  else
    if docker exec "$REDIS_CONTAINER" redis-cli -a "$REDIS_PASSWORD" ping 2>/dev/null | grep -q PONG; then
      pass "redis ping ($REDIS_CONTAINER)"
    else
      fail "redis ping failed"
    fi
  fi
fi

# --- 6. Backend logs (errors) ---
section "6. Backend logs (recent errors)"
# Exclude benign operator lines; Lending Oracle + lite server -701 is a known class (stale/rejected external msg) — backend uses Redis lock + monotonic ts; redeploy image if it persists alone.
RAW_LOG=$(docker logs --tail 120 "$BACKEND_CONTAINER" 2>&1 || true)
ORACLE_701=$(echo "$RAW_LOG" | grep -E '\[Lending Oracle\].*Error sending update:.*code -701' || true)
ERR_LINES=$(
  echo "$RAW_LOG" \
    | grep -iE 'panic|fatal|error' \
    | grep -viE '0 errors|errors in [0-9]+min|no errors|→ monitored' \
    | grep -viE '\[Lending Oracle\].*Error sending update:.*code -701' \
    || true
)
if [[ -z "$ERR_LINES" ]]; then ERR_COUNT=0; else ERR_COUNT=$(echo "$ERR_LINES" | wc -l); fi
if [[ "${ERR_COUNT:-0}" -gt 0 ]]; then
  warn "found $ERR_COUNT suspicious line(s) in last 120 log lines (sample)"
  printf '%s\n' "$ERR_LINES" | tail -5
else
  pass "no suspicious panic/fatal/error lines in last 120 lines"
fi
if [[ -n "$ORACLE_701" ]]; then
  note "Lending Oracle TON -701 in logs (contract rejected inbound msg). If this is the only issue, redeploy backend with current oracle keeper (Redis lock + monotonic timestamp)."
  echo "$ORACLE_701" | tail -2
fi

# --- 7. SSL ---
if [[ "$LOCAL_ONLY" -eq 0 ]]; then
  section "7. SSL certificate (app.gstdtoken.com)"
  if SSL_LINE=$(echo | timeout 15 openssl s_client -servername app.gstdtoken.com -connect app.gstdtoken.com:443 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null); then
    pass "$SSL_LINE"
  else
    warn "could not read SSL enddate (openssl/network)"
  fi
else
  section "7. SSL (skipped --local-only)"
fi

# --- 8. Disk ---
section "8. Disk / Docker usage"
df -h / | tail -1
docker system df 2>&1 | head -15
pass "disk summary printed"

# --- 9. Telegram bot ---
section "9. Telegram bot"
if docker inspect gstd-telegram-bot &>/dev/null; then
  docker logs --tail 12 gstd-telegram-bot 2>&1
  pass "gstd-telegram-bot logs"
else
  warn "container gstd-telegram-bot not found"
fi

# --- 10. Frontend local ---
section "10. Frontend (localhost:3000)"
FE_CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://localhost:3000 || echo "000")
if [[ "$FE_CODE" == "200" ]]; then
  pass "frontend $FE_CODE"
else
  warn "frontend http://localhost:3000 -> $FE_CODE (expected 200 if Docker frontend up)"
fi

# --- 11. Bridge ---
section "11. GSTD bridge"
if docker inspect gstd-bridge-test &>/dev/null; then
  docker logs --tail 8 gstd-bridge-test 2>&1
  pass "gstd-bridge-test logs"
else
  warn "container gstd-bridge-test not found"
fi

# --- 12. Images ---
section "12. GSTD-related images"
docker images --format "{{.Repository}}:{{.Tag}} {{.Size}}" | grep -E 'gstd|backend|bot|bridge' | sort || true

# --- 13. Node / rewards API ---
if [[ "$LOCAL_ONLY" -eq 0 ]]; then
  section "13. Core API endpoints"
  EPS=(
    "nodes/list"
    "agents/leaderboard"
    "agents/marketplace"
    "agents/stats/network"
    "leaderboard"
    "network/info"
    "network/stats"
  )
  for ep in "${EPS[@]}"; do
    code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "https://app.gstdtoken.com/api/v1/$ep" || echo "000")
    if [[ "$code" == "200" ]]; then
      pass "$code /api/v1/$ep"
    else
      fail "$code /api/v1/$ep"
    fi
  done
else
  section "13. Node rewards API (skipped --local-only)"
fi

# --- Summary ---
section "Summary"
echo "Failures: $FAILURES  Warnings: $WARNINGS"
if [[ "$FAILURES" -gt 0 ]]; then
  echo "Ecosystem audit: FAILED" >&2
  exit 1
fi
echo "Ecosystem audit: PASSED"
exit 0
