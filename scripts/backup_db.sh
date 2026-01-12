#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
docker exec ubuntu_postgres_1 pg_dump -U postgres distributed_computing | gzip > /home/ubuntu/backups/db_backup_$DATE.sql.gz
find /home/ubuntu/backups/ -name "*.gz" -mtime +7 -delete
