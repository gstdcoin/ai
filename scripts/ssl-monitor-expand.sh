#!/bin/bash
# Expand Let's Encrypt cert to include monitor.gstdtoken.com
# Run as root or with sudo. Ensure monitor.gstdtoken.com DNS points to this server.
set -e
echo "Expanding SSL cert to include monitor.gstdtoken.com..."
certbot certonly --nginx -d app.gstdtoken.com -d monitor.gstdtoken.com -d api.gstdtoken.com --expand --non-interactive --agree-tos -m admin@gstdtoken.com 2>/dev/null || \
certbot certonly --nginx -d app.gstdtoken.com -d monitor.gstdtoken.com -d api.gstdtoken.com --expand
echo "Reloading nginx..."
nginx -t && systemctl reload nginx 2>/dev/null || service nginx reload 2>/dev/null || true
echo "Done. https://monitor.gstdtoken.com should now work."
