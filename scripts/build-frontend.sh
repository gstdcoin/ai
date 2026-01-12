#!/bin/bash
# Frontend build script with dependency fixes

set -e

echo "🔨 Building Frontend..."
cd /home/ubuntu/frontend

# Check if package.json has @twa-dev/sdk
if ! grep -q "@twa-dev/sdk" package.json; then
    echo "⚠️  @twa-dev/sdk not found in package.json, adding..."
    # Add @twa-dev/sdk with latest compatible version
    npm install @twa-dev/sdk@latest --save
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Build
echo "🏗️  Building Next.js application..."
npm run build

echo "✅ Frontend build complete!"


