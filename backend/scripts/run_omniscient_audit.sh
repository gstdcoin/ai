#!/bin/bash
# GSTD TOTAL INTEGRITY: THE OMNISCIENT AUDIT
set -e
cd "$(dirname "$0")/.."
export API_URL="${API_URL:-https://app.gstdtoken.com}"
export ADMIN_API_KEY="${ADMIN_API_KEY:-gstd_system_key_2026}"
go run scripts/omniscient_audit.go
