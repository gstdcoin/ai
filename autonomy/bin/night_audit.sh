#!/bin/bash
# GSTD Nightly Security Audit Script
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
