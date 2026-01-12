#!/bin/bash
if ! curl -s --head http://localhost | grep "200\|301\|302" > /dev/null; then
    echo "Gateway is down! Restarting..."
    cd /home/ubuntu && docker compose restart gateway
fi
