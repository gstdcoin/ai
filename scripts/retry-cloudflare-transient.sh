#!/usr/bin/env bash
# Retry only Cloudflare's documented transient AI-binding generation failure.
# Permanent validation/auth/quota errors must fail immediately.
set -euo pipefail
log_file="$(mktemp)"
trap 'rm -f "$log_file"' EXIT
for attempt in 1 2; do
  if "$@" 2>&1 | tee "$log_file"; then exit 0; fi
  if [ "$attempt" -eq 2 ] || ! grep -Fq 'binding AI of type ai failed to generate: internal error' "$log_file"; then exit 1; fi
  echo '::warning::Cloudflare AI binding returned an internal error; retrying once in 10 seconds.'
  sleep 10
done
exit 1
