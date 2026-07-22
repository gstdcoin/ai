#!/bin/bash
# GSTD TOTAL INTEGRITY: THE OMNISCIENT AUDIT
set -e
cd "$(dirname "$0")/.."
export API_URL="${API_URL:-https://app.gstdtoken.com}"
export ADMIN_API_KEY="${ADMIN_API_KEY:?ADMIN_API_KEY must be set -- no insecure default}"
go run scripts/omniscient_audit/main.go
