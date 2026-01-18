#!/bin/bash

# GSTD "Ultimate Fixer" - System Integrity & Auto-Repair Agent
# Validates Frontend, Backend, Database, Network, and automatically repairs broken components.

BASE_URL="http://127.0.0.1"
HOST_HEADER="app.gstdtoken.com"
LOG_FILE="/var/log/gstd_monitor.log"

# Visuals
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() {
    echo -e "${BLUE}[$(date '+%H:%M:%S')]${NC} $1"
}

success() {
    echo -e "${GREEN}✅ $1${NC}"
}

fail() {
    echo -e "${RED}❌ $1${NC}"
}

# --- PROBES ---

check_frontend_html() {
    log "Probing Frontend Root..."
    resp=$(curl -s -L -k -H "Host: $HOST_HEADER" "$BASE_URL/")
    if [[ $resp == *"<!DOCTYPE html>"* ]] || [[ $resp == *"__next"* ]]; then
        success "Frontend served valid HTML"
        return 0
    else
        fail "Frontend returned invalid content (Length: ${#resp})"
        return 1
    fi
}

check_frontend_assets() {
    log "Probing Frontend Static Assets..."
    # 1. Fetch HTML
    html=$(curl -s -L -k -H "Host: $HOST_HEADER" "$BASE_URL/")
    # 2. Extract first _next/static script
    script_path=$(echo "$html" | grep -o '/_next/static/[^"]*\.js' | head -n 1)
    
    if [ -z "$script_path" ]; then
        fail "Could not find any Next.js scripts in HTML (Config mismatch?)"
        return 1
    fi

    # 3. Fetch the script
    log "Fetching asset: $script_path"
    code=$(curl -s -L -k -H "Host: $HOST_HEADER" -o /dev/null -w "%{http_code}" "$BASE_URL$script_path")
    
    if [ "$code" == "200" ]; then
        success "Frontend Asset reachable ($script_path)"
        return 0
    else
        fail "Frontend Asset 404/Error (Status: $code). Nginx/Volume issue?"
        return 2 # Asset Error
    fi
}

check_api_health() {
    log "Probing Backend API Health..."
    code=$(curl -s -L -k -H "Host: $HOST_HEADER" -o /dev/null -w "%{http_code}" "$BASE_URL/api/v1/health")
    if [ "$code" == "200" ]; then
        success "Backend API Alive"
        return 0
    else
        fail "Backend API Dead (Status: $code)"
        return 1
    fi
}

check_logic_balance() {
    log "Verifying Business Logic (Wallet Balance)..."
    resp=$(curl -s -L -k -H "Host: $HOST_HEADER" "$BASE_URL/api/v1/wallet/balance?wallet=UQ_INTEGRITY_CHECK")
    # Check for ton_balance (numeric or string 0)
    if echo "$resp" | grep -q "ton_balance"; then
        success "Balance Logic Valid (JSON OK)"
        return 0
    else
        fail "Balance Logic Broken (Invalid JSON): $(echo $resp | head -c 50)..."
        return 1
    fi
}

# --- REPAIR LOGIC ---

repair_frontend() {
    log "${YELLOW}🔧 REPAIRING FRONTEND...${NC}"
    docker compose -f docker-compose.prod.yml restart frontend-1 frontend-2
    sleep 10
}

repair_backend() {
    log "${YELLOW}🔧 REPAIRING BACKEND...${NC}"
    docker compose -f docker-compose.prod.yml restart backend-blue backend-green
    sleep 10
}

repair_routing() {
    log "${YELLOW}🔧 REPAIRING NETWORKING (Nginx)...${NC}"
    docker compose -f docker-compose.prod.yml restart nginx
    sleep 5
}

full_stack_restart() {
    log "${RED}🚑 CRITICAL FAILURE: PERFORMING FULL SYSTEM RESURRECTION...${NC}"
    docker compose -f docker-compose.prod.yml down
    sleep 3
    docker compose -f docker-compose.prod.yml up -d
    log "⏳ Waiting 30s for full boot..."
    sleep 30
}

# --- MAIN CONTROLLER ---

run_diagnostics() {
    score=0
    
    check_frontend_html || return 10 # Frontend Error
    check_frontend_assets || return 11 # Asset Error
    check_api_health || return 20 # Backend Error
    check_logic_balance || return 21 # Logic Error
    
    return 0 # All Good
}

log "=== GSTD SYSTEM INTEGRITY GUARD V2.0 ==="
log "Analyzing Platform Status..."

run_diagnostics
status=$?

if [ $status -eq 0 ]; then
    echo -e "\n${GREEN}✨ SYSTEM INTEGRITY 100% VERIFIED. NO ISSUES FOUND. ✨${NC}"
    exit 0
fi

echo -e "\n${YELLOW}⚠️ ISSUES DETECTED (Code $status). INITIATING AUTO-REPAIR.${NC}"

if [ $status -eq 10 ] || [ $status -eq 11 ]; then
    repair_frontend
    repair_routing
elif [ $status -eq 20 ] || [ $status -eq 21 ]; then
    repair_backend
fi

# Re-Check
log "Verifying Fixes..."
run_diagnostics
status_retry=$?

if [ $status_retry -eq 0 ]; then
    echo -e "${GREEN}✅ REPAIR SUCCESSFUL. SYSTEM RESTORED.${NC}"
    exit 0
fi

# Escalate
full_stack_restart

# Final Check
run_diagnostics
status_final=$?

if [ $status_final -eq 0 ]; then
    echo -e "${GREEN}✅ DEEP REPAIR SUCCESSFUL. SYSTEM RESTORED.${NC}"
    exit 0
else
    echo -e "${RED}💀 SYSTEM RECOVERY FAILED. MANUAL INTERVENTION REQUIRED.${NC}"
    echo "Check docker logs for details."
    exit 1
fi
