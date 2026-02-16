#!/bin/bash
# GSTD Nightly Security Audit Script
# Enhanced: TON Service (ignore .env message), Hive Memory stats, Escrow balance
if [ -f /home/ubuntu/.env ]; then
  source /home/ubuntu/.env 2>/dev/null || true
  ADMIN_API_KEY="${ADMIN_API_KEY:-$(grep '^ADMIN_API_KEY=' /home/ubuntu/.env 2>/dev/null | cut -d= -f2-)}"
  TELEGRAM_CHAT_ID="${TELEGRAM_CHAT_ID:-$(grep '^TELEGRAM_CHAT_ID=' /home/ubuntu/.env 2>/dev/null | cut -d= -f2-)}"
fi
REPORT_FILE="/home/ubuntu/autonomy/reports/night_audit.md"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

# Clear previous report (keep last run only)
echo "## 🛡️ GSTD Security Audit - $TIMESTAMP" > $REPORT_FILE
echo "" >> $REPORT_FILE

# 1. TON Service Check (exclude .env file message - informational only)
echo "### 💎 TON Service Status" >> $REPORT_FILE
TON_ERRORS=$(docker logs --since 1h ubuntu-backend-blue-1 2>&1 | grep -iE "error|vulnerability|attack|fail" | grep -v "No .env file found" | grep -v "error loading" | head -n 20)
if [ -z "$TON_ERRORS" ]; then
  # Get contract balance from health API
  HEALTH=$(curl -s "https://app.gstdtoken.com/api/v1/health" 2>/dev/null || echo "{}")
  CONTRACT_BAL=$(echo "$HEALTH" | grep -o '"balance_ton":[0-9.]*' | cut -d: -f2)
  [ -z "$CONTRACT_BAL" ] && CONTRACT_BAL="—"
  echo "✅ Connected | Contract: ${CONTRACT_BAL} TON" >> $REPORT_FILE
else
  echo "$TON_ERRORS" >> $REPORT_FILE
fi
echo "" >> $REPORT_FILE

# Resolve Postgres container for DB queries
PG_CONTAINER=""
if command -v docker >/dev/null 2>&1; then
  PG_CONTAINER=$(docker ps --format '{{.Names}}' | grep -E "postgres|gstd_postgres" | head -1)
fi

# 2. Hive Memory Stats (last hour)
echo "### 🧠 Hive Memory Stats" >> $REPORT_FILE
if [ -n "$PG_CONTAINER" ]; then
    NEW_TOOLS=$(docker exec "$PG_CONTAINER" psql -U postgres -d distributed_computing -t -A -c "SELECT COUNT(*) FROM agent_knowledge WHERE topic='grid_tool' AND created_at > NOW() - INTERVAL '1 hour'" 2>/dev/null | tr -d ' ')
    NEW_INSIGHTS=$(docker exec "$PG_CONTAINER" psql -U postgres -d distributed_computing -t -A -c "SELECT COUNT(*) FROM agent_knowledge WHERE topic='resonance_report' AND created_at > NOW() - INTERVAL '1 hour'" 2>/dev/null | tr -d ' ')
    [ -z "$NEW_TOOLS" ] && NEW_TOOLS=0
    [ -z "$NEW_INSIGHTS" ] && NEW_INSIGHTS=0
    echo "✅ New Tools: $NEW_TOOLS (grid_tool)" >> $REPORT_FILE
    echo "✅ New Insights: $NEW_INSIGHTS (resonance_report)" >> $REPORT_FILE
    # Sample task IDs if any
    if [ "$NEW_TOOLS" -gt 0 ] 2>/dev/null; then
      SAMPLE_IDS=$(docker exec "$PG_CONTAINER" psql -U postgres -d distributed_computing -t -A -c "SELECT string_agg(LEFT(agent_id, 8), ', ') FROM (SELECT agent_id FROM agent_knowledge WHERE topic='grid_tool' AND created_at > NOW() - INTERVAL '1 hour' ORDER BY created_at DESC LIMIT 5) t" 2>/dev/null | tr -d ' ')
      [ -n "$SAMPLE_IDS" ] && echo "   (agents: $SAMPLE_IDS)" >> $REPORT_FILE
    fi
else
  echo "⚠️  Postgres container not found for Hive stats." >> $REPORT_FILE
fi
echo "" >> $REPORT_FILE

# 3. Escrow Balance
echo "### 💰 Escrow Balance" >> $REPORT_FILE
if [ -n "$PG_CONTAINER" ]; then
  ESCROW_GSTD=$(docker exec "$PG_CONTAINER" psql -U postgres -d distributed_computing -t -A -c "SELECT COALESCE(ROUND(SUM(total_locked_gstd)::numeric, 2), 0) FROM task_escrow WHERE status='locked'" 2>/dev/null | tr -d ' ')
  [ -z "$ESCROW_GSTD" ] && ESCROW_GSTD=0
  echo "✅ Locked in Escrow: ${ESCROW_GSTD} GSTD" >> $REPORT_FILE
else
  # Fallback: try marketplace API
  MKTP=$(curl -s "https://app.gstdtoken.com/api/v1/marketplace/stats" 2>/dev/null)
  TOTAL_VOL=$(echo "$MKTP" | grep -o '"total_volume":[0-9.]*' | cut -d: -f2)
  [ -n "$TOTAL_VOL" ] && echo "✅ Total Volume (from API): ${TOTAL_VOL} GSTD" >> $REPORT_FILE
  [ -z "$TOTAL_VOL" ] && echo "⚠️  Escrow data unavailable." >> $REPORT_FILE
fi
echo "" >> $REPORT_FILE

# 4. Gold Reserves vs Tokens (ТЗ 3.Б: Night Audit — публичная проверка)
echo "### 🏦 Gold Reserves vs Tokens" >> $REPORT_FILE
AUDIT_URL="${API_URL:-https://app.gstdtoken.com}/api/v1/audit/reserves"
AUDIT_JSON=$(curl -s "$AUDIT_URL" 2>/dev/null || echo "{}")
if [ -n "$AUDIT_JSON" ] && [ "$AUDIT_JSON" != "{}" ]; then
  GOLD_XAUT=$(echo "$AUDIT_JSON" | grep -o '"gold_reserve_xaut":[0-9.]*' | cut -d: -f2)
  CIRC_GSTD=$(echo "$AUDIT_JSON" | grep -o '"circulating_gstd":[0-9.]*' | cut -d: -f2)
  RATIO=$(echo "$AUDIT_JSON" | grep -o '"reserve_ratio":[0-9.]*' | cut -d: -f2)
  [ -z "$GOLD_XAUT" ] && GOLD_XAUT="—"
  [ -z "$CIRC_GSTD" ] && CIRC_GSTD="—"
  [ -z "$RATIO" ] && RATIO="—"
  echo "✅ XAUt Reserve: ${GOLD_XAUT}" >> $REPORT_FILE
  echo "✅ Circulating GSTD: ${CIRC_GSTD}" >> $REPORT_FILE
  echo "✅ Reserve Ratio: ${RATIO}" >> $REPORT_FILE
else
  echo "⚠️  Audit API unavailable." >> $REPORT_FILE
fi
echo "" >> $REPORT_FILE

# 5. GEO Service
echo "### 🌍 Infrastructure" >> $REPORT_FILE
GEO_LOGS=$(docker logs --since 1h ubuntu-backend-blue-1 2>&1 | grep -i "geo")
if [ -z "$GEO_LOGS" ]; then
  echo "⚠️  No GEO Service activity in logs." >> $REPORT_FILE
else
  ERROR_LOGS=$(echo "$GEO_LOGS" | grep -iE "error|fail|timeout" | head -n 5)
  if [ -z "$ERROR_LOGS" ]; then
    echo "✅ GEO Service: OK ($(echo "$GEO_LOGS" | wc -l) entries)" >> $REPORT_FILE
  else
    echo "$ERROR_LOGS" >> $REPORT_FILE
  fi
fi
LOAD=$(cat /proc/loadavg 2>/dev/null | cut -d' ' -f1-3)
[ -n "$LOAD" ] && echo "✅ Load Average: $LOAD" >> $REPORT_FILE
echo "" >> $REPORT_FILE

echo "---" >> $REPORT_FILE
echo "Audit cycle complete. Run daily at 00:00 UTC (cron: 0 0 * * *)." >> $REPORT_FILE

# Notify admin via Telegram
if [ -n "$ADMIN_API_KEY" ] && [ -n "$TELEGRAM_CHAT_ID" ]; then
  SUMMARY=$(tail -n 50 "$REPORT_FILE" | head -n 40)
  BODY=$(echo "$SUMMARY" | sed 's/"/\\"/g' | tr '\n' ' ' | sed 's/  */ /g' | head -c 3000)
  curl -s -X POST "https://app.gstdtoken.com/api/v1/internal/telegram/notify-audit" \
    -H "Content-Type: application/json" \
    -H "X-Admin-API-Key: $ADMIN_API_KEY" \
    -d "{\"event\":\"Night Audit\",\"message\":\"$BODY\"}" > /dev/null 2>&1 || true
fi
