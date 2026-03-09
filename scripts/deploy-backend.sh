#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# GSTD Backend — Safe Blue-Green Deploy
# Usage: ./deploy-backend.sh [version_tag]
# Example: ./deploy-backend.sh v113
# ═══════════════════════════════════════════════════════════════
set -euo pipefail

VERSION="${1:-}"
if [ -z "$VERSION" ]; then
    echo "❌ Usage: $0 <version_tag> (e.g. v113)"
    exit 1
fi

NETWORK="ubuntu_gstd_network"
IMAGE="gstd-backend-blue:${VERSION}"
ENV_FILE="/home/ubuntu/backend/.env"
REPLICAS=4

echo "═══════════════════════════════════════════"
echo "🚀 GSTD Backend Deploy: ${VERSION}"
echo "═══════════════════════════════════════════"

# 1. Build
echo "📦 Building Docker image..."
cd /home/ubuntu/backend

# Free memory: stop 3 of 4 replicas during build
echo "🔧 Stopping 3 replicas to free memory for build..."
for i in 2 3 4; do
    docker stop ubuntu-backend-blue-$i 2>/dev/null || true
done

docker build -t "$IMAGE" .
echo "✅ Image built: $IMAGE"

# 2. Test new image
echo "🧪 Testing new image..."
TEST_CONTAINER="backend-test-${VERSION}"
docker run -d --name "$TEST_CONTAINER" \
    --network "$NETWORK" \
    --env-file "$ENV_FILE" \
    "$IMAGE" 2>/dev/null

sleep 15

if docker exec "$TEST_CONTAINER" wget --no-verbose --tries=1 --spider http://localhost:8080/api/v1/health 2>/dev/null; then
    echo "✅ Health check passed"
else
    echo "❌ Health check FAILED — aborting deploy!"
    docker stop "$TEST_CONTAINER" && docker rm "$TEST_CONTAINER"
    # Restart stopped replicas
    for i in 2 3 4; do
        docker start ubuntu-backend-blue-$i 2>/dev/null || true
    done
    exit 1
fi

docker stop "$TEST_CONTAINER" && docker rm "$TEST_CONTAINER"

# 3. Rolling deploy
echo "🔄 Rolling deploy..."
# Stop and remove all old replicas
for i in $(seq 1 $REPLICAS); do
    docker stop ubuntu-backend-blue-$i 2>/dev/null || true
    docker rm ubuntu-backend-blue-$i 2>/dev/null || true
done

# Start new replicas
for i in $(seq 1 $REPLICAS); do
    docker run -d \
        --name ubuntu-backend-blue-$i \
        --network "$NETWORK" \
        --env-file "$ENV_FILE" \
        --restart unless-stopped \
        "$IMAGE"
    echo "   ✅ Replica $i started"
done

# 4. Verify
sleep 15
echo "🔍 Verifying deployment..."
HEALTHY=0
for i in $(seq 1 $REPLICAS); do
    STATUS=$(docker inspect --format='{{.State.Health.Status}}' ubuntu-backend-blue-$i 2>/dev/null || echo "unknown")
    if [ "$STATUS" = "healthy" ] || [ "$STATUS" = "starting" ]; then
        HEALTHY=$((HEALTHY + 1))
    fi
done

echo "═══════════════════════════════════════════"
echo "✅ Deploy complete: $IMAGE"
echo "   Replicas: $HEALTHY/$REPLICAS healthy"
echo "═══════════════════════════════════════════"

# 5. Update docker-compose to reference new version
sed -i "s|gstd-backend-blue:v[0-9]*|gstd-backend-blue:${VERSION}|g" /home/ubuntu/docker-compose.prod.yml
echo "📝 docker-compose.prod.yml updated to ${VERSION}"
