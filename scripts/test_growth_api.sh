#!/bin/bash
# ============================================================================
# GSTD API Integration Test
# Tests all Growth System endpoints
# ============================================================================

BASE_URL="${1:-http://localhost:8080}"
WALLET="EQDtest1234567890abcdefghijklmnopqrstuvwxyz123456"

echo "🧪 GSTD API Integration Test"
echo "Base URL: $BASE_URL"
echo "============================================"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

test_endpoint() {
    METHOD=$1
    ENDPOINT=$2
    DATA=$3
    EXPECTED=$4
    
    if [ "$METHOD" == "GET" ]; then
        RESPONSE=$(curl -s -w "%{http_code}" -o /tmp/response.txt "$BASE_URL$ENDPOINT" 2>&1)
    else
        RESPONSE=$(curl -s -w "%{http_code}" -o /tmp/response.txt -X $METHOD -H "Content-Type: application/json" -d "$DATA" "$BASE_URL$ENDPOINT" 2>&1)
    fi
    
    BODY=$(cat /tmp/response.txt 2>/dev/null)
    
    if [ "$RESPONSE" -ge 200 ] && [ "$RESPONSE" -lt 300 ]; then
        echo -e "${GREEN}✓${NC} $METHOD $ENDPOINT -> $RESPONSE"
    else
        echo -e "${RED}✗${NC} $METHOD $ENDPOINT -> $RESPONSE"
        echo "  Response: $BODY"
    fi
}

echo ""
echo "📌 PUBLIC ENDPOINTS"
echo "-------------------------------------------"

# Health Check
test_endpoint "GET" "/api/v1/health"

# Burn Stats
test_endpoint "GET" "/api/v1/burn/stats"
test_endpoint "GET" "/api/v1/burn/simulate?amount=100"
test_endpoint "GET" "/api/v1/burn/history"

# Bonus Status
test_endpoint "GET" "/api/v1/bonus/status?wallet=$WALLET"

# Agent Marketplace
test_endpoint "GET" "/api/v1/marketplace/agents"
test_endpoint "GET" "/api/v1/marketplace/agents/featured"

# Referral Leaderboard  
test_endpoint "GET" "/api/v1/referrals/leaderboard"

echo ""
echo "📌 TELEGRAM MINI APP ENDPOINTS"
echo "-------------------------------------------"

# Telegram Init
test_endpoint "POST" "/api/v1/telegram/init" '{"telegram_id": 123456789, "username": "test_user"}'

# Telegram Onboard
test_endpoint "POST" "/api/v1/telegram/onboard" "{\"wallet_address\": \"$WALLET\", \"referral_code\": \"TESTCODE\"}"

# Telegram Stats
test_endpoint "GET" "/api/v1/telegram/stats?wallet=$WALLET"

# Start/Stop Earning
test_endpoint "POST" "/api/v1/telegram/earn/start" "{\"wallet_address\": \"$WALLET\"}"
test_endpoint "POST" "/api/v1/telegram/earn/stop" "{\"wallet_address\": \"$WALLET\"}"

echo ""
echo "📌 BONUS ENDPOINTS"
echo "-------------------------------------------"

# Welcome Bonus
test_endpoint "POST" "/api/v1/bonus/welcome" "{\"wallet_address\": \"$WALLET\", \"source\": \"test\"}"

# Agent Bootstrap
test_endpoint "POST" "/api/v1/tokens/agent/bootstrap" "{\"agent_wallet\": \"$WALLET\", \"agent_name\": \"TestBot\"}"

# Faucet
test_endpoint "POST" "/api/v1/telegram/faucet" "{\"wallet_address\": \"$WALLET\"}"

echo ""
echo "📌 REFERRAL ENDPOINTS"
echo "-------------------------------------------"

# Generate Code
test_endpoint "POST" "/api/v1/referrals/generate" "{\"wallet_address\": \"$WALLET\"}"

# Get Stats
test_endpoint "GET" "/api/v1/referrals/stats?wallet=$WALLET"

echo ""
echo "============================================"
echo "🏁 Test Complete!"
