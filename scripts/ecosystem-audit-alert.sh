#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# Runs ecosystem-audit.sh; on failure optionally notifies Telegram.
#
# Env:
#   TELEGRAM_BOT_TOKEN   — bot token (optional)
#   TELEGRAM_CHAT_ID     — numeric chat id (optional)
#   AUDIT_ALERT_PREFIX   — message prefix (default: GSTD ecosystem audit FAILED)
#
# Usage:
#   ./scripts/ecosystem-audit-alert.sh
#   ./scripts/ecosystem-audit-alert.sh --local-only
# ═══════════════════════════════════════════════════════════════
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

if [[ -f "$REPO_ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$REPO_ROOT/.env"
  set +a
fi

ARGS=("$@")
if [[ ${#ARGS[@]} -eq 0 ]]; then
  ARGS=()
fi

LOG="${AUDIT_ALERT_LOG:-/tmp/gstd-ecosystem-audit-last.log}"
PREFIX="${AUDIT_ALERT_PREFIX:-GSTD ecosystem audit FAILED}"

set +e
"$REPO_ROOT/scripts/ecosystem-audit.sh" "${ARGS[@]}" 2>&1 | tee "$LOG"
RC=${PIPESTATUS[0]}
set -e

if [[ "$RC" -ne 0 ]] && [[ -n "${TELEGRAM_BOT_TOKEN:-}" ]] && [[ -n "${TELEGRAM_CHAT_ID:-}" ]]; then
  MSG=$(printf '%s\nHost: %s\nLog tail:\n%s' "$PREFIX" "$(hostname -f 2>/dev/null || hostname)" "$(tail -c 3500 "$LOG" 2>/dev/null || true)")
  curl -sS -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
    --data-urlencode "chat_id=${TELEGRAM_CHAT_ID}" \
    --data-urlencode "text=${MSG}" \
    --data-urlencode "disable_web_page_preview=true" >/dev/null || true
fi

exit "$RC"
