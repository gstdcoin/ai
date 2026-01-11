# GSTD Platform Architecture

## Overview

GSTD (Global System for Trusted Distributed Computing) is a DePIN (Decentralized Physical Infrastructure Network) platform for verifiable distributed computations on the TON blockchain.

## System Architecture

```
┌─────────────────┐
│   Frontend      │  Next.js, TypeScript, TonConnect
│   (Port 3000)   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│     Nginx       │  Reverse Proxy, SSL Termination
│  (Ports 80/443) │
└────────┬────────┘
         │
         ├─────────────────┐
         ▼                 ▼
┌─────────────────┐  ┌─────────────────┐
│    Backend      │  │   PostgreSQL    │
│   (Port 8080)   │  │   (Port 5432)    │
└────────┬────────┘  └─────────────────┘
         │
         ▼
┌─────────────────┐
│     Redis       │  Pub/Sub, Caching
│   (Port 6379)   │
└─────────────────┘
```

## Components

### Frontend
- **Framework:** Next.js 14
- **Language:** TypeScript
- **Wallet:** TonConnect
- **State Management:** React Context
- **Styling:** Tailwind CSS

### Backend
- **Language:** Go 1.21
- **Framework:** Gin
- **Database:** PostgreSQL 15
- **Cache:** Redis 7
- **Architecture:** Microservices

### Database Schema

#### Core Tables
- `tasks` - Task definitions and status
- `devices` - Registered computing devices
- `nodes` - Computing nodes
- `users` - User accounts
- `validations` - Task result validations
- `golden_reserve_log` - GSTD/XAUt swap log

#### Payment Tables
- `payout_intents` - Payout intentions
- `payout_transactions` - Transaction tracking
- `failed_payouts` - Failed payout retries

## Data Flow

### Task Creation Flow
1. User creates task via frontend (`NewTaskModal`)
2. Frontend checks GSTD balance (minimum 0.000001 GSTD)
3. Frontend sends request to backend `POST /api/v1/tasks/create?wallet_address=EQ...`
4. Backend validates request and creates task with `pending_payment` status
5. Backend returns `payment_memo` (format: `TASK-{task_id}`) and `platform_wallet`
6. User sends GSTD tokens to `platform_wallet` with `payment_memo` in transaction comment
7. `PaymentWatcher` service detects payment via TON API
8. Backend verifies payment amount and memo match
9. Task status changes to `queued`
10. Task broadcast via WebSocket/Redis Pub/Sub to workers

### Task Execution Flow
1. Worker connects via WebSocket or polls `/api/v1/tasks/worker/pending`
2. Worker receives available tasks (status: `pending` or `queued`)
3. Worker claims task via `POST /api/v1/device/tasks/:id/claim` (status: `assigned`)
4. Worker executes task locally (browser or device)
5. Worker signs result with Ed25519 signature using TonConnect
6. Worker submits result via `POST /api/v1/tasks/worker/submit` with signature
7. Backend validates Ed25519 signature
8. Backend validates result (consensus if redundancy > 1)
9. Task status: `validated` or `completed`
10. Worker requests payout intent via `POST /api/v1/payments/payout-intent`
11. Worker receives payout intent with escrow contract address
12. Worker builds transaction payload using `@ton/core`
13. Worker signs transaction via TonConnect (pull-model)
14. Escrow contract automatically distributes:
    - 95% to worker (executor_reward_ton)
    - 5% to platform treasury (platform_fee_ton)

## Security

### Encryption
- **Algorithm:** AES-256-GCM
- **Key Derivation:** SHA-256(taskID + requesterAddress)
- **Nonce:** Random 12-byte per encryption

### Signatures
- **Algorithm:** Ed25519
- **Purpose:** Result authenticity verification
- **Process:** Sign(taskID + resultData)

### Authentication
- **Method:** Wallet address verification
- **Header:** `X-Wallet-Address`
- **Validation:** TON address format check

## Performance Optimizations

### Database
- Connection pooling
- Indexed queries
- Query optimization
- Connection limits

### Caching
- Redis for TON API responses
- TTL-based cache invalidation
- Pub/Sub for real-time updates

### Network
- Nginx rate limiting
- Gzip compression
- HTTP/2 support
- Keep-alive connections

## Monitoring

### Metrics
- Prometheus-compatible endpoint: `/api/v1/metrics`
- Database connection count
- Task statistics
- Device statistics
- System uptime

### Health Checks
- Endpoint: `/api/v1/health`
- Database connectivity
- Contract reachability
- Service status

## Deployment

### Docker Compose
All services containerized:
- `ubuntu_backend_1` - Backend service
- `ubuntu_frontend_1` - Frontend service
- `ubuntu_postgres_1` - PostgreSQL database
- `ubuntu_redis_1` - Redis cache
- `ubuntu_nginx_1` - Nginx reverse proxy

### Environment Variables
See `.env.example` for required variables.

### Scaling
- Horizontal: Multiple backend instances
- Vertical: Resource limits in docker-compose
- Database: Read replicas (future)

## Disaster Recovery

### Backups
- Database: Daily automated backups
- Configuration: Version controlled
- SSL certificates: Secured storage

### Recovery
- Point-in-time recovery from backups
- Container restart policies
- Health check auto-recovery
