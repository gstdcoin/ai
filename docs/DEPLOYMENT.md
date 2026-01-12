# GSTD Platform Deployment Guide

## Prerequisites

- Docker 20.10+
- Docker Compose 2.0+
- 4GB+ RAM
- 20GB+ disk space
- Linux/Unix system

## Quick Start

### 1. Clone Repository
```bash
git clone https://github.com/gstdcoin/ai.git
cd ai
```

### 2. Configure Environment
```bash
cp .env.example .env
# Edit .env with your configuration
```

### 3. Start Services
```bash
docker-compose up -d
```

### 4. Verify Deployment
```bash
# Check health
curl http://localhost:8080/api/v1/health

# Check metrics
curl http://localhost:8080/api/v1/metrics
```

## Production Deployment

### 1. Security Configuration

#### SSL Certificates
```bash
# Install certbot
sudo apt-get install certbot

# Generate certificates
sudo certbot certonly --standalone -d app.gstdtoken.com

# Copy certificates to nginx/ssl
sudo cp -r /etc/letsencrypt/live/app.gstdtoken.com nginx/ssl/
```

#### Environment Variables
Set secure values in `.env`:
- Strong database passwords
- TON API keys
- Admin wallet addresses
- Private keys (if using push model)

### 2. Database Setup

#### Initial Migration
```bash
# Apply all migrations in order
docker-compose exec postgres psql -U postgres -d distributed_computing -f /path/to/backend/migrations/v17_fix_missing_tables_and_columns.sql
docker-compose exec postgres psql -U postgres -d distributed_computing -f /path/to/backend/migrations/v18_performance_indexes.sql

# Or use migration script
cd backend
go run main.go migrate  # If migration tool is implemented
```

#### Backup Configuration
```bash
# Create backup script
cat > scripts/backup.sh << 'EOF'
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
docker-compose exec -T postgres pg_dump -U postgres distributed_computing | gzip > backups/db_$DATE.sql.gz
EOF
chmod +x scripts/backup.sh

# Add to cron
0 2 * * * /path/to/scripts/backup.sh
```

### 3. Monitoring Setup

#### Prometheus (Optional)
```yaml
# Add to docker-compose.yml
  prometheus:
    image: prom/prometheus:latest
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
    ports:
      - "9090:9090"
```

#### Grafana (Optional)
```yaml
# Add to docker-compose.yml
  grafana:
    image: grafana/grafana:latest
    ports:
      - "3001:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
```

### 4. Scaling

#### Horizontal Scaling
```yaml
# docker-compose.yml
  backend:
    deploy:
      replicas: 3
    # ... other config
```

#### Load Balancing
Update nginx config to use multiple backend instances:
```nginx
upstream backend {
    least_conn;
    server backend:8080;
    server backend2:8080;
    server backend3:8080;
}
```

### 5. Maintenance

#### Update Services
```bash
# Pull latest code
git pull origin main

# Rebuild and restart
docker-compose up -d --build
```

#### Database Migrations
```bash
# Apply new migrations
docker-compose exec postgres psql -U postgres -d distributed_computing < backend/migrations/vXX_new_migration.sql
```

#### Logs
```bash
# View logs
docker-compose logs -f backend
docker-compose logs -f frontend

# Rotate logs
docker-compose exec backend logrotate /etc/logrotate.conf
```

## Troubleshooting

### Database Connection Issues
```bash
# Reset password
docker-compose exec postgres psql -U postgres -c "ALTER ROLE postgres WITH PASSWORD 'newpassword';"

# Check connections
docker-compose exec postgres psql -U postgres -c "SELECT count(*) FROM pg_stat_activity;"
```

### High CPU Usage
```bash
# Check slow queries
docker-compose exec postgres psql -U postgres -d distributed_computing -c "SELECT * FROM pg_stat_statements ORDER BY total_time DESC LIMIT 10;"

# Analyze tables
docker-compose exec postgres psql -U postgres -d distributed_computing -c "ANALYZE;"
```

### Memory Issues
```bash
# Check memory usage
docker stats

# Restart services
docker-compose restart
```

## Rollback Procedure

### 1. Stop Services
```bash
docker-compose down
```

### 2. Restore Database
```bash
# Restore from backup
gunzip < backups/db_YYYYMMDD_HHMMSS.sql.gz | docker-compose exec -T postgres psql -U postgres -d distributed_computing
```

### 3. Revert Code
```bash
git checkout <previous-commit>
docker-compose up -d --build
```

## Health Checks

### Automated Monitoring
```bash
# Use monitor.sh script
./monitor.sh

# Or add to cron
*/5 * * * * /path/to/monitor.sh
```

### Manual Checks
```bash
# Health endpoint
curl http://localhost:8080/api/v1/health

# Metrics
curl http://localhost:8080/api/v1/metrics

# Database
docker-compose exec postgres pg_isready -U postgres

# Redis
docker-compose exec redis redis-cli ping
```
