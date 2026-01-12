#!/bin/bash
# Run tests for GSTD Platform

set -e

echo "=========================================="
echo "GSTD Platform - Running Tests"
echo "=========================================="
echo ""

cd "$(dirname "$0")/../backend"

echo "[1/3] Running linter..."
if command -v golangci-lint &> /dev/null; then
    golangci-lint run --timeout=5m
    echo "✅ Linter passed"
else
    echo "⚠️  golangci-lint not installed, skipping..."
fi

echo ""
echo "[2/3] Running unit tests..."
go test -v -race -coverprofile=coverage.out ./...

echo ""
echo "[3/3] Generating coverage report..."
if [ -f coverage.out ]; then
    go tool cover -html=coverage.out -o coverage.html
    COVERAGE=$(go tool cover -func=coverage.out | grep total | awk '{print $3}')
    echo "✅ Coverage: $COVERAGE"
    echo "📄 Coverage report: backend/coverage.html"
fi

echo ""
echo "=========================================="
echo "✅ All tests completed!"
echo "=========================================="
