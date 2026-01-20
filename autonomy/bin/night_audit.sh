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
# Adjusting to look into general backend logs if geo is internal
docker logs --since 1h ubuntu-backend-blue-1 2>&1 | grep -i "geo" | grep -iE "error|fail|timeout" | head -n 20 >> $REPORT_FILE
echo "" >> $REPORT_FILE

echo "---" >> $REPORT_FILE
echo "Audit cycle complete."
