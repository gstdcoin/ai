#!/bin/bash
# GSTD OMNI-VERIFICATION: FINAL ZERO
# Run after deploying backend with seed-omni-test-task endpoint
# Usage: ./run_omni_verification.sh
# Env: API_URL, ADMIN_API_KEY, DATABASE_URL, ADMIN_WALLET

set -e
cd "$(dirname "$0")/.."

export API_URL="${API_URL:-https://app.gstdtoken.com}"
export ADMIN_API_KEY="${ADMIN_API_KEY:?ADMIN_API_KEY must be set -- no insecure default}"

echo "GSTD OMNI-VERIFICATION: FINAL ZERO"
echo "API_URL=$API_URL"
echo ""

go run scripts/omni_verification_final_zero/main.go
