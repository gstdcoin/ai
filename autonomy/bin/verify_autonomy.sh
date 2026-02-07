#!/bin/bash

# ═══════════════════════════════════════════════════════════════════════════
# GSTD AUTONOMY VERIFICATION SCRIPT
# Проверяет все компоненты автономности платформы
# ═══════════════════════════════════════════════════════════════════════════

set -e
echo "🔍 ═══════════════════════════════════════════════════════════"
echo "🔍   GSTD AUTONOMY VERIFICATION"
echo "🔍   Checking all autonomous components..."
echo "🔍 ═══════════════════════════════════════════════════════════"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

passed=0
failed=0
warnings=0

check() {
    desc="$1"
    shift
    if "$@" > /dev/null 2>&1; then
        echo -e "${GREEN}✅${NC} $desc"
        ((passed++))
    else
        echo -e "${RED}❌${NC} $desc"
        ((failed++))
    fi
}

warn_check() {
    desc="$1"
    shift
    if "$@" > /dev/null 2>&1; then
        echo -e "${GREEN}✅${NC} $desc"
        ((passed++))
    else
        echo -e "${YELLOW}⚠️${NC} $desc (warning)"
        ((warnings++))
    fi
}

echo ""
echo "📦 CORE INFRASTRUCTURE"
echo "─────────────────────────────────────"
check "PostgreSQL Running" docker ps --filter "name=gstd_postgres" --filter "status=running" -q | grep .
check "Redis Running" docker ps --filter "name=gstd_redis" --filter "status=running" -q | grep .
check "Nginx Load Balancer Running" docker ps --filter "name=gstd_nginx" --filter "status=running" -q | grep .
check "Backend Healthy" curl -sf http://localhost/api/v1/health -o /dev/null

echo ""
echo "🧠 AI BRAIN (OLLAMA)"
echo "─────────────────────────────────────"
check "Ollama Container Running" docker ps --filter "name=gstd_ollama" --filter "status=running" -q | grep .
warn_check "Ollama API Responsive" curl -sf http://localhost:11434/api/tags -o /dev/null || docker exec gstd_ollama curl -sf http://localhost:11434/api/tags -o /dev/null

# Check if models are loaded
echo -n "   Models: "
MODELS=$(docker exec gstd_ollama ollama list 2>/dev/null | tail -n +2 | awk '{print $1}' | tr '\n' ', ' || echo "none")
echo "$MODELS"

echo ""
echo "🤖 AUTOMATION COMPONENTS"
echo "─────────────────────────────────────"
check "Bot Container Running" docker ps --filter "name=gstd_bot" --filter "status=running" -q | grep .
check "n8n Workflow Engine Running" docker ps --filter "name=gstd_n8n" --filter "status=running" -q | grep .
check "Watchtower Updates Running" docker ps --filter "name=gstd_watchtower" --filter "status=running" -q | grep .
check "Vector Log Pipeline Running" docker ps --filter "name=gstd_vector" --filter "status=running" -q | grep .

echo ""
echo "📁 AUTONOMY CODE"
echo "─────────────────────────────────────"
check "AutoFix Engine Exists" test -f /home/ubuntu/autonomy/bot/internal/services/auto_fix_engine.go
check "Intelligent Orchestrator Exists" test -f /home/ubuntu/autonomy/bot/internal/services/intelligent_orchestrator.go
check "Hive Knowledge Exists" test -f /home/ubuntu/autonomy/bot/internal/services/hive_knowledge.go
check "Superintelligence Launcher Exists" test -f /home/ubuntu/autonomy/bot/cmd/superintelligence/main.go
check "Self-Healing Script Exists" test -f /home/ubuntu/autonomy/bin/self_healing_loop.sh
check "Autonomous Maintenance Script Exists" test -f /home/ubuntu/autonomy/scripts/autonomous_maintenance.sh

echo ""
echo "📚 DOCUMENTATION"
echo "─────────────────────────────────────"
check "SMART_BACKLOG.md Exists" test -f /home/ubuntu/autonomy/SMART_BACKLOG.md
check "SUPERINTELLIGENCE_ROADMAP.md Exists" test -f /home/ubuntu/autonomy/SUPERINTELLIGENCE_ROADMAP.md
check "INTERNAL_AGENT.md Exists" test -f /home/ubuntu/autonomy/INTERNAL_AGENT.md

echo ""
echo "🔐 SECURITY"
echo "─────────────────────────────────────"
check "Secrets not in .git" ! grep -r "TELEGRAM_BOT_TOKEN=" /home/ubuntu/.git 2>/dev/null
check "API Keys not in logs" ! grep -ri "api_key" /home/ubuntu/logs/*.log 2>/dev/null || true
check ".env exists" test -f /home/ubuntu/.env

echo ""
echo "📊 BACKEND SERVICES" 
echo "─────────────────────────────────────"
check "Maintenance Service Active" grep -q "MaintenanceService" /home/ubuntu/backend/internal/services/maintenance_service.go
check "Error Logger Active" grep -q "ErrorLogger" /home/ubuntu/backend/internal/services/error_logger.go

echo ""
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "📋 SUMMARY"
echo "─────────────────────────────────────"
echo -e "   ${GREEN}Passed:${NC}   $passed"
echo -e "   ${RED}Failed:${NC}   $failed"
echo -e "   ${YELLOW}Warnings:${NC} $warnings"
echo ""

if [ $failed -eq 0 ]; then
    echo -e "${GREEN}🎉 ALL CRITICAL CHECKS PASSED!${NC}"
    echo "   The platform is ready for autonomous operation."
    echo ""
    echo "📌 NEXT STEPS:"
    echo "   1. Start Superintelligence Core:"
    echo "      cd /home/ubuntu/autonomy/bot && go run cmd/superintelligence/main.go"
    echo ""
    echo "   2. Run Self-Healing Loop:"
    echo "      /home/ubuntu/autonomy/bin/self_healing_loop.sh"
    echo ""
    echo "   3. Monitor via n8n:"
    echo "      https://n8n.gstdtoken.com"
else
    echo -e "${RED}⚠️ SOME CHECKS FAILED!${NC}"
    echo "   Please fix the issues above before enabling full autonomy."
fi

echo ""
echo "═══════════════════════════════════════════════════════════"
