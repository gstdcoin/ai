#!/bin/bash

# Script to fix backend build issues

echo "=== Fixing Backend Build ==="

cd "$(dirname "$0")/../backend" || exit 1

# Create a temporary Docker container to generate go.sum
echo "Generating go.sum in temporary container..."

docker run --rm -v "$(pwd)":/app -w /app golang:1.21-alpine sh -c "
    go mod download
    go mod tidy
    cat go.sum
" > /tmp/go.sum

# Copy generated go.sum back
if [ -f /tmp/go.sum ] && [ -s /tmp/go.sum ]; then
    cp /tmp/go.sum ./go.sum
    echo "✓ go.sum generated successfully"
    cat go.sum | head -5
else
    echo "⚠ Warning: Could not generate go.sum automatically"
    echo "You may need to install Go locally and run: go mod tidy"
fi

cd ..

echo "=== Done ==="



