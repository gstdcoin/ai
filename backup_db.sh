#!/bin/bash
CONTAINER_NAME="cc5ed5a6d5ec_ubuntu_postgres_1"
BACKUP_PATH="/home/ubuntu/backups"
mkdir -p $BACKUP_PATH
docker exec -t $CONTAINER_NAME pg_dumpall -c -U postgres > $BACKUP_PATH/db_backup_$(date +%Y%m%d_%H%M%S).sql
find $BACKUP_PATH -type f -mtime +7 -name "*.sql" -delete
