#!/bin/bash
# Проверяем статус через локальный порт бэкенда
if ! curl -s http://localhost:8080/api/v1/health | grep "healthy" > /dev/null
then
    echo "$(date): Backend unhealthy. Restarting..." >> /home/ubuntu/restart_log.txt
    cd /home/ubuntu && docker compose restart backend
fi
