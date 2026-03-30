#!/bin/bash
# Auto-reload nginx Docker container after SSL certificate renewal
echo "[$(date)] SSL renewed — reloading nginx..."
docker exec gstd_nginx_lb nginx -s reload && echo "OK" || echo "ERROR"
