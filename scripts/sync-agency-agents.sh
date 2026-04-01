#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# Sync [The Agency](https://github.com/msitarzewski/agency-agents) Cursor rules
# into .cursor/rules/ (project-local). GSTD rules in .cursorrules stay canonical.
# Usage: from repo root — ./scripts/sync-agency-agents.sh
# ═══════════════════════════════════════════════════════════════
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP_DIR="${TMPDIR:-/tmp}/agency-agents-sync-$$"
CLONE_URL="${AGENCY_AGENTS_GIT:-https://github.com/msitarzewski/agency-agents.git}"

cleanup() { rm -rf "$TMP_DIR"; }
trap cleanup EXIT

echo "Cloning agency-agents (shallow)..."
git clone --depth 1 "$CLONE_URL" "$TMP_DIR"

echo "Converting for Cursor..."
"$TMP_DIR/scripts/convert.sh" --tool cursor

echo "Installing rules into $REPO_ROOT/.cursor/rules/ ..."
cd "$REPO_ROOT"
"$TMP_DIR/scripts/install.sh" --no-interactive --tool cursor

echo "Done. Optional specialists are in .cursor/rules/ — see .cursorrules and agents/workflows/state.md"
