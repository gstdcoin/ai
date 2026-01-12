#!/bin/bash

# Script to renew Let's Encrypt certificates
# Should be run via cron: 0 3 * * * /path/to/renew-cert.sh

docker-compose run --rm certbot renew
docker-compose exec nginx nginx -s reload



