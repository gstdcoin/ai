#!/bin/bash

# Quick test script to verify builds

set -e

echo "=== Testing Backend Build ==="
cd "$(dirname "$0")/.."

echo "Building backend..."
docker-compose build backend 2>&1 | tail -20

if [ $? -eq 0 ]; then
    echo "✓ Backend build successful"
else
    echo "✗ Backend build failed"
    exit 1
fi

echo ""
echo "=== Testing Nginx Config ==="
docker-compose run --rm --no-deps nginx nginx -t 2>&1 | tail -10

if [ $? -eq 0 ]; then
    echo "✓ Nginx config valid"
else
    echo "✗ Nginx config invalid"
    exit 1
fi

echo ""
echo "=== All tests passed ==="


