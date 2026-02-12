#!/bin/bash
# GSTD Nightly Security Audit Script
if [ -f /home/ubuntu/.env ]; then
  ADMIN_API_KEY=$(grep '^ADMIN_API_KEY=' /home/ubuntu/.env 2>/dev/null | cut -d= -f2-)
  TELEGRAM_CHAT_ID=$(grep '^TELEGRAM_CHAT_ID=' /home/ubuntu/.env 2>/dev/null | cut -d= -f2-)
fi
REPORT_FILE="/home/ubuntu/autonomy/reports/night_audit.md"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

echo "## 🛡️ GSTD Security Audit - $TIMESTAMP" >> $REPORT_FILE
echo "" >> $REPORT_FILE

# Scan TON Service
echo "### 💎 TON Service Check" >> $REPORT_FILE
docker logs --since 1h ubuntu-backend-blue-1 2>&1 | grep -iE "error|vulnerability|attack|fail" | head -n 20 >> $REPORT_FILE
if [ $? -ne 0 ]; then echo "✅ No immediate anomalies detected in TON service." >> $REPORT_FILE; fi
echo "" >> $REPORT_FILE

# Scan GEO Service (Assuming geo-service container exists or logs are in backend)
echo "### 🌍 GEO Service Check" >> $REPORT_FILE
GEO_LOGS=$(docker logs --since 1h ubuntu-backend-blue-1 2>&1 | grep -i "geo")
if [ -z "$GEO_LOGS" ]; then
    echo "⚠️  No GEO Service activity or initialization found in logs." >> $REPORT_FILE
else
    ERROR_LOGS=$(echo "$GEO_LOGS" | grep -iE "error|fail|timeout" | head -n 20)
    if [ -z "$ERROR_LOGS" ]; then
        echo "✅ GEO Service is running correctly (found $(echo "$GEO_LOGS" | wc -l) log entries)." >> $REPORT_FILE
    else
        echo "$ERROR_LOGS" >> $REPORT_FILE
    fi
fi
echo "" >> $REPORT_FILE

echo "---" >> $REPORT_FILE
echo "Audit cycle complete."

# Notify admin via Telegram
if [ -n "$ADMIN_API_KEY" ] && [ -n "$TELEGRAM_CHAT_ID" ]; then
    SUMMARY=$(tail -n 30 "$REPORT_FILE" | head -n 25)
    curl -s -X POST "https://app.gstdtoken.com/api/v1/internal/telegram/notify-audit" \
        -H "Content-Type: application/json" \
        -H "X-Admin-API-Key: $ADMIN_API_KEY" \
        -d "{\"event\":\"Night Audit\",\"message\":\"$(echo "$SUMMARY" | sed 's/"/\\"/g' | tr '\n' ' ' | head -c 3000)\"}" > /dev/null 2>&1 || true
fi
