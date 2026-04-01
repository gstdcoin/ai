#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# Full local verification — same gates as CI + ecosystem-audit --local-only.
# Stops on first failure (set -e). Run from repo root:
#   ./scripts/verify-all.sh
#
# Optional:
#   VERIFY_FULL_AUDIT=1   also run public URL checks (needs prod routing)
#   VERIFY_GOSEC=1        run gosec on backend (may report findings)
#   VERIFY_DOCKER=1       docker build backend image (requires Docker daemon)
# ═══════════════════════════════════════════════════════════════
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "1/6  go vet (backend)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
( cd "$ROOT/backend" && go vet ./... )

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "2/6  go test (backend)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
( cd "$ROOT/backend" && go test ./... -count=1 -race -timeout 120s )

if [[ "${VERIFY_GOSEC:-}" == "1" ]]; then
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "    gosec (optional VERIFY_GOSEC=1)"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  if ! command -v gosec &>/dev/null; then
    go install github.com/securego/gosec/v2/cmd/gosec@latest
  fi
  ( cd "$ROOT/backend" && gosec -exclude-dir=docs ./... )
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "3/6  Tact contracts (all *.tact under contracts/)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
while IFS= read -r -d '' f; do
  echo "  → ${f#$ROOT/}"
  npx --no-install tact --check "$f" 2>/dev/null || npx tact --check "$f"
done < <(find "$ROOT/contracts" -name node_modules -prune -o -name '*.tact' -print0 | sort -z)

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "4/6  npm run lint (frontend)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
( cd "$ROOT/frontend" && npm run lint )

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "5/6  npm run build (frontend)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
( cd "$ROOT/frontend" && npm run build )

if [[ "${VERIFY_DOCKER:-}" == "1" ]]; then
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "    docker build backend (VERIFY_DOCKER=1)"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  ( cd "$ROOT/backend" && docker build -t gstd-backend:verify -f Dockerfile . -q >/dev/null )
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "6/6  ecosystem-audit.sh"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [[ "${VERIFY_FULL_AUDIT:-}" == "1" ]]; then
  "$ROOT/scripts/ecosystem-audit.sh"
else
  "$ROOT/scripts/ecosystem-audit.sh" --local-only
fi

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  VERIFY_ALL: PASSED (no errors)"
echo "═══════════════════════════════════════════════════════════════"
