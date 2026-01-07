#!/bin/bash
# Health check script for the platform
# This script checks all services and can be used for monitoring

set -e

EXIT_CODE=0

echo "=== Platform Health Check ==="
echo "Timestamp: $(date)"
echo ""

# Check Docker
if ! systemctl is-active --quiet docker; then
    echo "❌ Docker service is not running"
    EXIT_CODE=1
else
    echo "✅ Docker service is running"
fi

# Check containers
echo ""
echo "=== Container Status ==="
CONTAINERS=("ubuntu_postgres_1" "ubuntu_redis_1" "ubuntu_backend_1" "ubuntu_frontend_1" "nginx")

for container in "${CONTAINERS[@]}"; do
    if docker ps --format "{{.Names}}" | grep -q "^${container}$"; then
        STATUS=$(docker inspect --format='{{.State.Status}}' "$container" 2>/dev/null)
        HEALTH=$(docker inspect --format='{{.State.Health.Status}}' "$container" 2>/dev/null || echo "no-healthcheck")
        
        if [ "$STATUS" = "running" ]; then
            if [ "$HEALTH" = "healthy" ] || [ "$HEALTH" = "no-healthcheck" ]; then
                echo "✅ $container: running ($HEALTH)"
            else
                echo "⚠️  $container: running but unhealthy ($HEALTH)"
                EXIT_CODE=1
            fi
        else
            echo "❌ $container: $STATUS"
            EXIT_CODE=1
        fi
    else
        echo "❌ $container: not found"
        EXIT_CODE=1
    fi
done

# Check database connectivity
echo ""
echo "=== Database Check ==="
if docker exec ubuntu_postgres_1 pg_isready -U postgres >/dev/null 2>&1; then
    echo "✅ PostgreSQL is accepting connections"
    
    # Check if tables exist
    TABLE_COUNT=$(docker exec ubuntu_postgres_1 psql -U postgres -d distributed_computing -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';" 2>/dev/null | tr -d ' ')
    if [ -n "$TABLE_COUNT" ] && [ "$TABLE_COUNT" -gt 0 ]; then
        echo "✅ Database has $TABLE_COUNT tables"
    else
        echo "⚠️  Database appears to be empty or inaccessible"
        EXIT_CODE=1
    fi
else
    echo "❌ PostgreSQL is not accepting connections"
    EXIT_CODE=1
fi

# Check Redis
echo ""
echo "=== Redis Check ==="
if docker exec ubuntu_redis_1 redis-cli ping >/dev/null 2>&1; then
    echo "✅ Redis is responding"
else
    echo "❌ Redis is not responding"
    EXIT_CODE=1
fi

# Check backend API
echo ""
echo "=== Backend API Check ==="
if curl -sf http://localhost/api/v1/admin/health >/dev/null 2>&1; then
    echo "✅ Backend API is responding"
else
    echo "⚠️  Backend API is not responding (may be normal if using HTTPS)"
    # Try HTTPS
    if curl -sfk https://localhost/api/v1/admin/health >/dev/null 2>&1; then
        echo "✅ Backend API is responding via HTTPS"
    else
        echo "❌ Backend API is not responding"
        EXIT_CODE=1
    fi
fi

# Check disk space
echo ""
echo "=== Disk Space Check ==="
DISK_USAGE=$(df -h / | awk 'NR==2 {print $5}' | sed 's/%//')
if [ "$DISK_USAGE" -lt 80 ]; then
    echo "✅ Disk usage: ${DISK_USAGE}%"
elif [ "$DISK_USAGE" -lt 90 ]; then
    echo "⚠️  Disk usage: ${DISK_USAGE}% (getting high)"
else
    echo "❌ Disk usage: ${DISK_USAGE}% (critical)"
    EXIT_CODE=1
fi

# Check memory
echo ""
echo "=== Memory Check ==="
MEM_USAGE=$(free | awk 'NR==2{printf "%.0f", $3*100/$2}')
if [ "$MEM_USAGE" -lt 80 ]; then
    echo "✅ Memory usage: ${MEM_USAGE}%"
elif [ "$MEM_USAGE" -lt 90 ]; then
    echo "⚠️  Memory usage: ${MEM_USAGE}% (getting high)"
else
    echo "❌ Memory usage: ${MEM_USAGE}% (critical)"
    EXIT_CODE=1
fi

# Check image freshness
echo ""
echo "=== Image Freshness Check ==="
if /home/ubuntu/scripts/check-image-freshness.sh >/dev/null 2>&1; then
    echo "✅ All images are up to date"
else
    echo "⚠️  Some images may be outdated"
    EXIT_CODE=1
fi

echo ""
if [ $EXIT_CODE -eq 0 ]; then
    echo "✅ All checks passed"
else
    echo "❌ Some checks failed"
fi

exit $EXIT_CODE

