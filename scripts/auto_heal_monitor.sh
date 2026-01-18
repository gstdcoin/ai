#!/bin/bash

# GSTD Platform Auto-Healing Monitor
# Validates system health and automatically attempts repairs if issues are detected.

BASE_URL="http://127.0.0.1/api/v1"
HOST_HEADER="app.gstdtoken.com"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() {
    echo -e "$(date '+%Y-%m-%d %H:%M:%S') $1"
}

check_endpoint() {
    url=$1
    name=$2
    
    response=$(curl -s -L -k -o /dev/null -w "%{http_code}" -H "Host: $HOST_HEADER" "$url")
    
    if [ "$response" == "200" ]; then
        log "${GREEN}✅ $name is Healthy (200 OK)${NC}"
        return 0
    else
        log "${RED}❌ $name Failed (Status: $response)${NC}"
        # Print actual response body for debugging if not 200
        # curl -s -H "Host: $HOST_HEADER" "$url" | head -c 200
        return 1
    fi
}

check_balance_logic() {
    wallet="UQ_MONITOR_TEST_WALLET"
    response=$(curl -s -L -k -H "Host: $HOST_HEADER" "$BASE_URL/wallet/balance?wallet=$wallet")
    
    if echo "$response" | jq -e '.ton_balance' > /dev/null; then
        log "${GREEN}✅ Balance Logic is Healthy${NC}"
        return 0
    else
        log "${RED}❌ Balance Logic Failed: $response${NC}"
        return 1
    fi
}

verify_system() {
    errors=0
    log "Starting System Verification..."
    check_endpoint "$BASE_URL/health" "API Health" || errors=$((errors+1))
    check_endpoint "$BASE_URL/marketplace/tasks" "Marketplace" || errors=$((errors+1))
    check_balance_logic || errors=$((errors+1))
    
    if [ $errors -eq 0 ]; then
        return 0
    else
        return 1
    fi
}

auto_heal() {
    log "${YELLOW}⚠️ System Unhealthy. Initiating Auto-Healing Protocols...${NC}"
    
    log "🔄 Strategy 1: Restarting Backend Services..."
    # We use 'backend-blue' specifically as primary, or rely on lb
    docker compose -f docker-compose.prod.yml restart backend-blue backend-green
    
    log "⏳ Waiting for services to stabilize (15s)..."
    sleep 15
    
    if verify_system; then
        log "${GREEN}🎉 Auto-Healing Successful!${NC}"
        return 0
    fi
    
    log "${YELLOW}🔄 Strategy 1 Failed. Strategy 2: Nginx Restart...${NC}"
    docker compose -f docker-compose.prod.yml restart nginx
    sleep 5
    
    if verify_system; then
         log "${GREEN}🎉 Auto-Healing Strategy 2 Successful!${NC}"
         return 0
    fi

    log "${RED}💀 CRITICAL: Auto-Healing Failed.${NC}"
    return 1
}

# Ensure script is run from project root or adjust paths
# We assume /home/ubuntu default

if verify_system; then
    log "${GREEN}🚀 System is 100% Operational.${NC}"
    exit 0
else
    auto_heal
    exit $?
fi
