#!/bin/bash

# Script to generate Swagger documentation for GSTD DePIN Platform API

set -e

echo "🔧 Generating Swagger documentation..."

# Check if swag is installed
if ! command -v swag &> /dev/null; then
    echo "❌ swag is not installed. Installing..."
    go install github.com/swaggo/swag/cmd/swag@latest
fi

# Change to backend directory
cd "$(dirname "$0")/.."

# Generate Swagger docs
swag init -g main.go -o ./docs --parseDependency --parseInternal

echo "✅ Swagger documentation generated successfully!"
echo "📚 Documentation available at: /api/v1/swagger/index.html"
echo ""
echo "To view locally:"
echo "  1. Start the backend server"
echo "  2. Open http://localhost:8080/api/v1/swagger/index.html"
echo ""
echo "Production:"
echo "  https://app.gstdtoken.xyz/api/v1/swagger/index.html"
