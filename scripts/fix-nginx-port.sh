#!/bin/bash

# Script to stop system nginx and free port 80

echo "=== Fixing Nginx Port 80 ==="

# Check if nginx is running
if systemctl is-active --quiet nginx; then
    echo "Stopping system nginx..."
    sudo systemctl stop nginx
    sudo systemctl disable nginx
    echo "✓ System nginx stopped"
else
    echo "✓ System nginx is not running"
fi

# Check if port 80 is still in use
if sudo ss -tlnp | grep -q ":80 "; then
    echo "⚠ Warning: Port 80 is still in use"
    echo "Processes using port 80:"
    sudo ss -tlnp | grep ":80 "
    echo ""
    echo "You may need to stop these processes manually"
else
    echo "✓ Port 80 is free"
fi

echo "=== Done ==="



