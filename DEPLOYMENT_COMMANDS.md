# GSTD Platform Deployment Commands

## Pre-Deployment Checklist

1. ✅ SSL certificates located at `/home/ubuntu/nginx/ssl/live/app.gstdtoken.com/`
2. ✅ Environment variables configured in `/home/ubuntu/.env`
3. ✅ TON API key configured (Mainnet)
4. ✅ GSTD Jetton address configured
5. ⚠️ TON Contract Address needs to be set after escrow deployment

## Step 1: Verify Configuration

```bash
# Check SSL certificates
ls -la /home/ubuntu/nginx/ssl/live/app.gstdtoken.com/

# Verify environment variables
cat /home/ubuntu/.env | grep -E "TON|GSTD|DB|REDIS"
```

## Step 2: Build and Start Services

```bash
cd /home/ubuntu

# Build all services
docker-compose -f docker-compose.prod.yml build

# Start services in detached mode
docker-compose -f docker-compose.prod.yml up -d

# View logs
docker-compose -f docker-compose.prod.yml logs -f

# Check service status
docker-compose -f docker-compose.prod.yml ps
```

## Step 3: Verify Deployment

```bash
# Check backend health
curl https://app.gstdtoken.com/api/v1/stats

# Check frontend
curl -I https://app.gstdtoken.com

# Check WebSocket endpoint
curl -I https://app.gstdtoken.com/ws
```

## Step 4: Database Migrations

```bash
# Run migrations (if needed)
docker-compose -f docker-compose.prod.yml exec backend ./migrate up

# Or manually via psql
docker-compose -f docker-compose.prod.yml exec db psql -U postgres -d distributed_computing
```

## Step 5: Monitor Services

```bash
# View all logs
docker-compose -f docker-compose.prod.yml logs -f

# View specific service logs
docker-compose -f docker-compose.prod.yml logs -f backend
docker-compose -f docker-compose.prod.yml logs -f nginx

# Check resource usage
docker stats
```

## Maintenance Commands

```bash
# Stop all services
docker-compose -f docker-compose.prod.yml down

# Stop and remove volumes (⚠️ deletes data)
docker-compose -f docker-compose.prod.yml down -v

# Restart a specific service
docker-compose -f docker-compose.prod.yml restart backend

# Rebuild and restart
docker-compose -f docker-compose.prod.yml up -d --build

# View service logs
docker-compose -f docker-compose.prod.yml logs --tail=100 backend
```

## Troubleshooting

```bash
# Check if ports are in use
sudo netstat -tulpn | grep -E "80|443|8080|3000"

# Check Docker network
docker network ls
docker network inspect gstd_network

# Check container health
docker-compose -f docker-compose.prod.yml ps
docker inspect gstd_backend | grep -A 10 Health
```

## Telegram Bot Integration

The backend is configured to receive requests from Telegram Mini App at:
- **URL**: `https://app.gstdtoken.com`
- **WebSocket**: `wss://app.gstdtoken.com/ws`
- **API**: `https://app.gstdtoken.com/api/v1/*`

Ensure the Telegram Bot (@GstdAppBot) is configured with:
- Web App URL: `https://app.gstdtoken.com`
- API endpoint: `https://app.gstdtoken.com/api/v1/*`

