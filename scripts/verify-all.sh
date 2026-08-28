#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# Full local verification — same gates as CI.
# Stops on first failure (set -e). Run from repo root:
#   ./scripts/verify-all.sh
# ═══════════════════════════════════════════════════════════════
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "1/3  Tact contracts (all *.tact under contracts/)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
while IFS= read -r -d '' f; do
  echo "  → ${f#$ROOT/}"
  npx --no-install tact --check "$f" 2>/dev/null || npx tact --check "$f"
done < <(find "$ROOT/contracts" -name node_modules -prune -o -name '*.tact' -print0 | sort -z)

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "2/3  npm run lint (frontend)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
( cd "$ROOT/frontend" && npm run lint )

echo "     locale parity (en/ru common.json)"
"$ROOT/scripts/verify-locale-parity.sh"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "3/3  npm run build (frontend)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
( cd "$ROOT/frontend" && npm run build )

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  VERIFY_ALL: PASSED (no errors)"
echo "═══════════════════════════════════════════════════════════════"
