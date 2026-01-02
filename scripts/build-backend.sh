#!/bin/bash

# Script to properly build backend with go.sum

set -e

echo "=== Building Backend ==="

cd "$(dirname "$0")/.." || exit 1

# Generate go.sum if it doesn't exist or is empty
if [ ! -f backend/go.sum ] || [ ! -s backend/go.sum ]; then
    echo "Generating go.sum..."
    cd backend
    docker run --rm -v "$(pwd)":/app -w /app golang:1.21-alpine sh -c "
        go mod download
        go mod tidy
    "
    cd ..
    echo "✓ go.sum generated"
fi

# Build backend
echo "Building backend..."
docker-compose build --no-cache backend

echo "=== Done ==="



