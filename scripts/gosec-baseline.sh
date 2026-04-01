#!/usr/bin/env bash
# Baseline gosec invocation — CI + verify-all (VERIFY_GOSEC=1).
# Excludes: G104 (unchecked errors — prefer errcheck in IDE), dev scripts/, and rules
# that are mostly false positives in this codebase (see SECURITY.md).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT/backend"
exec gosec \
  -exclude-dir=docs \
  -exclude-dir=scripts \
  -exclude=G104,G704,G204,G118,G101,G706,G404,G304,G115,G202,G301,G122,G201,G107,G302,G306 \
  ./...
