# CI/CD Pipeline Documentation

## Overview

GSTD Platform uses GitHub Actions for continuous integration and deployment with blue-green deployment strategy for zero-downtime deployments.

## Pipeline Architecture

```
┌─────────────┐
│   Push/PR   │
└──────┬──────┘
       │
       ├─► Frontend Lint & Type Check
       ├─► Frontend Build Test
       ├─► Backend Tests (with Postgres & Redis)
       │
       ├─► Build Docker Images (Backend & Frontend)
       │   └─► Push to GitHub Container Registry
       │
       └─► Deploy to Production (main branch only)
           ├─► Pull latest code
           ├─► Pull Docker images
           ├─► Blue-Green Deployment
           ├─► Health Checks
           └─► Cleanup
```

## Pipeline Stages

### 1. Frontend Checks

#### Frontend Lint & Type Check
- **Triggers**: All pushes and PRs
- **Steps**:
  - Setup Node.js 20
  - Install dependencies (cached)
  - Run ESLint
  - Type check with TypeScript

#### Frontend Build Test
- **Triggers**: All pushes and PRs
- **Steps**:
  - Setup Node.js 20
  - Install dependencies (cached)
  - Build Next.js application
  - Verify build succeeds

### 2. Backend Tests

#### Backend Test Job
- **Triggers**: All pushes and PRs
- **Services**: PostgreSQL 15, Redis 7
- **Steps**:
  - Setup Go 1.21
  - Cache Go modules
  - Install dependencies
  - Run golangci-lint
  - Run unit tests with race detection
  - Generate coverage report
  - Upload coverage to Codecov

### 3. Build Stage

#### Docker Image Build
- **Triggers**: Push to main/develop (after tests pass)
- **Strategy**: Matrix build (backend, frontend)
- **Steps**:
  - Setup Docker Buildx
  - Login to GitHub Container Registry
  - Extract metadata (tags, labels)
  - Build and push images with:
    - Branch tags
    - SHA tags
    - Semantic version tags
    - Latest tag (main branch only)
  - Cache layers using GitHub Actions cache

**Image Tags:**
- `ghcr.io/gstdcoin/ai-backend:main`
- `ghcr.io/gstdcoin/ai-backend:main-<sha>`
- `ghcr.io/gstdcoin/ai-backend:latest` (main only)
- Same for frontend

### 4. Deploy Stage

#### Production Deployment
- **Triggers**: 
  - Push to `main` branch
  - Manual workflow dispatch
- **Environment**: Production
- **Steps**:
  1. Setup SSH connection
  2. Pull latest code from repository
  3. Pull latest Docker images
  4. Check database connection
  5. Deploy using blue-green strategy
  6. Wait for services to be ready
  7. Run health checks (backend & frontend)
  8. Cleanup old Docker images
  9. Verify deployment status

## Blue-Green Deployment

### How It Works

1. **Blue Environment**: Current production (active)
2. **Green Environment**: New deployment (inactive)
3. **Deployment Process**:
   - Build and start green environment
   - Wait for health checks
   - Gradually shift traffic from blue to green
   - Verify green environment
   - Stop blue environment
4. **Rollback**: Instant rollback by switching back to blue

### Deployment Script

The deployment uses `scripts/blue-green-deploy.sh`:

```bash
#!/bin/bash
# Blue-Green Deployment Script

# 1. Determine current color (blue/green)
# 2. Build and start next color
# 3. Wait for health checks
# 4. Update nginx load balancer
# 5. Verify new deployment
# 6. Stop old deployment
```

### Manual Deployment

```bash
# SSH to production server
ssh ubuntu@your-server

# Navigate to project
cd /home/ubuntu

# Pull latest code
git pull origin main

# Run deployment script
./scripts/deploy.sh

# Or use blue-green directly
./scripts/blue-green-deploy.sh
```

## Configuration

### GitHub Secrets Required

| Secret | Description | Example |
|--------|-------------|---------|
| `SSH_HOST` | Production server IP/hostname | `82.115.48.228` |
| `SSH_USER` | SSH username | `ubuntu` |
| `SSH_KEY` | SSH private key (full key) | `-----BEGIN OPENSSH PRIVATE KEY-----...` |
| `SSH_KNOWN_HOSTS` | SSH known hosts | Output of `ssh-keyscan` |
| `SSH_PORT` | SSH port (optional) | `22` |

### Getting SSH Known Hosts

```bash
ssh-keyscan -H your-server-ip >> ~/.ssh/known_hosts
# Copy the output to GitHub secret SSH_KNOWN_HOSTS
```

### Environment Variables

Production environment variables are set in `.env` file on the server:

```bash
DB_USER=postgres
DB_PASSWORD=your_password
DB_NAME=distributed_computing
TON_CONTRACT_ADDRESS=EQ...
ADMIN_WALLET=UQ...
GSTD_JETTON_ADDRESS=EQD...
NEXT_PUBLIC_API_URL=https://app.gstdtoken.com
```

## Monitoring Deployment

### Health Checks

The deployment script performs health checks:

```bash
# Backend health check
curl http://localhost:8080/api/v1/health

# Frontend health check
curl http://localhost:3000
```

### View Logs

```bash
# All services
docker-compose -f docker-compose.prod.yml logs -f

# Specific service
docker-compose -f docker-compose.prod.yml logs -f backend

# Recent logs
docker-compose -f docker-compose.prod.yml logs --tail=100 --since=10m
```

### Check Status

```bash
# Container status
docker-compose -f docker-compose.prod.yml ps

# Resource usage
docker stats

# Service health
docker-compose -f docker-compose.prod.yml ps | grep healthy
```

## Rollback Procedure

### Automatic Rollback

The deployment script automatically rolls back if:
- Health checks fail
- Services don't start within timeout
- Database connection fails

### Manual Rollback

```bash
# Option 1: Use rollback script
./scripts/rollback.sh

# Option 2: Switch deployment color manually
echo "blue" > /tmp/gstd_deployment_color
./scripts/blue-green-deploy.sh

# Option 3: Revert to previous Git commit
git reset --hard HEAD~1
./scripts/deploy.sh
```

### Database Rollback

```bash
# Restore from backup
gunzip < backups/postgres/backup_YYYYMMDD_HHMMSS.sql.gz | \
  docker-compose -f docker-compose.prod.yml exec -T postgres \
  psql -U postgres -d distributed_computing
```

## Best Practices

1. **Always test in staging first**
   - Use `develop` branch for staging deployments
   - Test all features before merging to `main`

2. **Monitor during deployment**
   - Watch logs in real-time
   - Check health endpoints
   - Monitor error rates

3. **Keep blue environment running**
   - Don't stop blue until green is verified
   - Keep rollback option available

4. **Verify after deployment**
   - Check all endpoints
   - Test critical user flows
   - Monitor metrics and logs

5. **Have rollback plan ready**
   - Know how to rollback quickly
   - Keep backups current
   - Document rollback procedure

## Troubleshooting

### Deployment Fails

1. **Check GitHub Actions logs**
   - Go to Actions tab
   - Find failed workflow run
   - Check error messages

2. **Check server logs**
   ```bash
   ssh ubuntu@your-server
   docker-compose -f docker-compose.prod.yml logs --tail=100
   ```

3. **Check container status**
   ```bash
   docker-compose -f docker-compose.prod.yml ps
   docker ps -a
   ```

### SSH Connection Fails

1. **Verify SSH key**
   - Check key format (full key with headers)
   - Ensure no extra spaces
   - Verify key has no passphrase

2. **Check known hosts**
   - Run `ssh-keyscan` again
   - Update `SSH_KNOWN_HOSTS` secret

3. **Test SSH manually**
   ```bash
   ssh -i ~/.ssh/your_key ubuntu@your-server
   ```

### Health Checks Fail

1. **Check service logs**
   ```bash
   docker-compose logs backend
   docker-compose logs frontend
   ```

2. **Check database connection**
   ```bash
   docker-compose exec postgres pg_isready -U postgres
   ```

3. **Check network connectivity**
   ```bash
   docker-compose exec backend ping postgres
   docker-compose exec backend ping redis
   ```

### Images Not Pulling

1. **Check registry authentication**
   - Verify `GITHUB_TOKEN` is available
   - Check image tags exist

2. **Pull manually**
   ```bash
   docker pull ghcr.io/gstdcoin/ai-backend:main
   docker pull ghcr.io/gstdcoin/ai-frontend:main
   ```

## Workflow Duration

Typical workflow durations:

- **Frontend checks**: ~2-3 minutes
- **Backend tests**: ~3-5 minutes
- **Build images**: ~5-10 minutes
- **Deploy**: ~5-10 minutes
- **Total**: ~15-28 minutes

## Manual Workflow Dispatch

You can manually trigger deployments:

1. Go to GitHub Actions
2. Select "CI/CD Pipeline"
3. Click "Run workflow"
4. Select:
   - Branch: `main`
   - Environment: `production` or `staging`
5. Click "Run workflow"

## CI/CD Status Badge

Add to README.md:

```markdown
![CI/CD](https://github.com/gstdcoin/ai/workflows/CI/CD%20Pipeline/badge.svg)
```
