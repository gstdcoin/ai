#!/bin/bash

# Script to generate Swagger documentation using Docker
# This works even if Go is not installed on the host system

set -e

echo "🔧 Generating Swagger documentation using Docker..."

# Change to backend directory
cd "$(dirname "$0")/.."

# Use Docker to generate Swagger docs
docker run --rm \
  -v "$(pwd)":/app \
  -w /app \
  golang:1.21-alpine \
  sh -c "
    apk add --no-cache git && \
    export GOPATH=/go && \
    go install github.com/swaggo/swag/cmd/swag@latest && \
    \$GOPATH/bin/swag init -g main.go -o ./docs --parseDependency --parseInternal
  "

echo "✅ Swagger documentation generated successfully!"
echo "📚 Documentation available at: /api/v1/swagger/index.html"
echo ""
echo "Next steps:"
echo "  1. Rebuild backend: docker-compose build backend"
echo "  2. Restart backend: docker-compose restart backend"
echo "  3. Open: https://app.gstdtoken.com/api/v1/swagger/index.html"
