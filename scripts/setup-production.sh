#!/bin/bash

# Complete production setup script

set -e

echo "=== Production Setup for app.gstdtoken.com ==="
echo ""

# Check if running as root
if [ "$EUID" -eq 0 ]; then 
   echo "Please do not run as root"
   exit 1
fi

# Step 1: Create directories
echo "Step 1: Creating directories..."
mkdir -p nginx/ssl nginx/certbot
chmod 755 nginx/certbot
echo "✓ Directories created"

# Step 2: Generate go.sum if needed
echo ""
echo "Step 2: Checking backend dependencies..."
if [ ! -f backend/go.sum ] || [ ! -s backend/go.sum ]; then
    echo "Generating go.sum..."
    cd backend
    docker run --rm -v "$(pwd)":/app" -w /app golang:1.21-alpine sh -c "
        go mod download
        go mod tidy
    "
    cd ..
    echo "✓ go.sum generated"
else
    echo "✓ go.sum exists"
fi

# Step 3: Get SSL certificate
echo ""
echo "Step 3: Getting SSL certificate..."
echo "This will start only Nginx for certificate generation..."
read -p "Continue? (y/N) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    ./scripts/init-letsencrypt.sh
else
    echo "Skipping SSL certificate generation"
    echo "You can run ./scripts/init-letsencrypt.sh later"
fi

# Step 4: Build and start all services
echo ""
echo "Step 4: Building and starting all services..."
docker-compose up -d --build

# Step 5: Check status
echo ""
echo "Step 5: Checking service status..."
sleep 5
docker-compose ps

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Check services:"
echo "  docker-compose ps"
echo ""
echo "View logs:"
echo "  docker-compose logs -f"
echo ""
echo "Test the site:"
echo "  curl -I https://app.gstdtoken.com"
echo ""



