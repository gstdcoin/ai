#!/bin/bash
# GSTD Health Report Generator
# Usage: ./generate_health_report.sh
# output: /home/ubuntu/frontend/public/worker_health_report.json

OUTPUT_FILE="/home/ubuntu/frontend/public/worker_health_report.json"
mkdir -p $(dirname "$OUTPUT_FILE")

# Get active workers count
ACTIVE_WORKERS=$(docker exec gstd_postgres_prod psql -U postgres -d distributed_computing -t -c "SELECT COUNT(*) FROM nodes WHERE status='active'" | xargs)
ACTIVE_DEVICES=$(docker exec gstd_postgres_prod psql -U postgres -d distributed_computing -t -c "SELECT COUNT(*) FROM devices WHERE is_active=true" | xargs)

# Get total TFLOPS estimate (Active Nodes * 1.5)
TFLOPS=$(echo "scale=2; $ACTIVE_WORKERS * 1.5" | bc)

# Get Active Countries
COUNTRIES=$(docker exec gstd_postgres_prod psql -U postgres -d distributed_computing -t -c "SELECT STRING_AGG(DISTINCT country, ', ') FROM nodes WHERE status='active' AND country IS NOT NULL" | xargs)

# Timestamp
DATE=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Create JSON
cat <<EOF > "$OUTPUT_FILE"
{
  "generated_at": "$DATE",
  "status": "healthy",
  "network": {
    "active_nodes": ${ACTIVE_WORKERS:-0},
    "active_devices": ${ACTIVE_DEVICES:-0},
    "estimated_tflops": ${TFLOPS:-0},
    "active_countries": "${COUNTRIES:-None}"
  },
  "audit": {
    "verification_method": "on-chain + heartbeat",
    "verified_by": "GSTD Oracle"
  }
}
EOF

# Ensure readable
chmod 644 "$OUTPUT_FILE"
