# CI/CD Pipeline Documentation

## Overview

GSTD Platform uses GitHub Actions for continuous integration and deployment with blue-green deployment strategy.

## Pipeline Stages

### 1. Test Stage
- **Triggers**: Push to `main` or `develop`, Pull Requests
- **Services**: PostgreSQL 15, Redis 7
- **Steps**:
  - Run Go linter (golangci-lint)
  - Run unit tests with race detection
  - Generate coverage report
  - Upload coverage to Codecov

### 2. Build Stage
- **Triggers**: Push to `main` or `develop` (after tests pass)
- **Steps**:
  - Build Docker images for backend and frontend
  - Push to GitHub Container Registry
  - Tag images with branch, SHA, and version

### 3. Deploy Stage
- **Triggers**: Push to `main` branch only
- **Steps**:
  - SSH to production server
  - Pull latest code
  - Pull Docker images
  - Deploy using blue-green strategy
  - Apply database migrations

## Blue-Green Deployment

### How It Works

1. **Blue Environment**: Current production
2. **Green Environment**: New deployment
3. **Switch**: Traffic gradually shifted from blue to green
4. **Rollback**: Instant rollback by switching back to blue

### Deployment Process

```bash
# Deploy new version
./scripts/blue-green-deploy.sh

# Rollback if needed
./scripts/rollback.sh
```

### Manual Deployment

```bash
# 1. Build new version
docker-compose -f docker-compose.prod.yml build

# 2. Start green environment
docker-compose -f docker-compose.prod.yml up -d --scale backend-green=2

# 3. Wait for health checks
# 4. Update nginx to route to green
# 5. Verify
# 6. Stop blue environment
```

## Rollback Procedure

### Automatic Rollback
- Health checks fail → automatic rollback
- Deployment script detects failure → reverts changes

### Manual Rollback
```bash
./scripts/rollback.sh
```

### Database Rollback
```bash
# Restore from backup
gunzip < backups/postgres/backup_YYYYMMDD_HHMMSS.sql.gz | \
  docker-compose exec -T postgres psql -U postgres -d distributed_computing
```

## Configuration

### GitHub Secrets Required
- `SSH_HOST`: Production server hostname
- `SSH_USER`: SSH username
- `SSH_KEY`: SSH private key

### Environment Variables
See `.env.example` for required variables.

## Monitoring Deployment

### Health Checks
```bash
# Check health
curl http://localhost/api/v1/health

# Check metrics
curl http://localhost/api/v1/metrics
```

### Logs
```bash
# Backend logs
docker-compose -f docker-compose.prod.yml logs -f backend-green

# All services
docker-compose -f docker-compose.prod.yml logs -f
```

## Best Practices

1. **Always test in staging first**
2. **Monitor health checks during deployment**
3. **Keep blue environment running during deployment**
4. **Verify metrics after deployment**
5. **Have rollback plan ready**
