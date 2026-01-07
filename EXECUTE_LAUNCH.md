# 🚀 GSTD Platform - Mainnet Launch Execution Guide

## Quick Start

Execute the automated launch sequence:
```bash
./scripts/launch_sequence.sh
```

Or follow manual steps below.

---

## Manual Launch Steps

### Step 1: Database Reset

```bash
./scripts/production_ready.sh
# Type 'YES' when prompted
```

**Expected Output:**
```
✅ Database cleanup complete!
The database is now ready for mainnet launch.
The first transaction will be Launch Transaction #1.
```

### Step 2: Environment Configuration

Create/update `.env` file in root directory:

```bash
# Production Mode
GIN_MODE=release

# Mainnet Configuration
TON_NETWORK=mainnet
XAUT_JETTON_MASTER=EQCyD8v6khUUrce9BCvHOaBC9PrvlV9S7D5v67O80p444XAr
GSTD_JETTON_ADDRESS=<your-mainnet-jetton-address>
STONFI_ROUTER=<mainnet-stonfi-router>
TREASURY_WALLET=EQA--JXG8VSyBJmLMqb2J2t4Pya0TS9SXHh7vHh8Iez25sLp

# Security
ADMIN_SECRET=<generate-strong-random-string-here>
WITHDRAWAL_LOCK_THRESHOLD=500.0

# API Keys
TON_API_KEY=<your-tonapi-key>

# Database (if not using defaults)
DB_HOST=postgres
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=postgres
DB_NAME=distributed_computing
```

**Generate Strong Admin Secret:**
```bash
# Option 1: Using openssl
openssl rand -hex 32

# Option 2: Using /dev/urandom
cat /dev/urandom | tr -dc 'a-zA-Z0-9' | fold -w 64 | head -n 1
```

### Step 3: Build Frontend

```bash
docker compose build frontend
```

**Verify Build:**
- Check that `NEXT_PUBLIC_API_URL` is set to `https://app.gstdtoken.com/api`
- No localhost references in production build

### Step 4: Restart Infrastructure

```bash
# Stop all containers
docker compose down

# Start with fresh containers
docker compose up -d --force-recreate

# Check status
docker compose ps
```

**Verify Services:**
```bash
# Backend health
curl http://localhost:8080/api/v1/stats/public

# Should return JSON with stats (may be empty initially)
```

### Step 5: SSL Verification

```bash
curl -vI https://app.gstdtoken.com
```

**Expected:**
- HTTP/2 200
- Valid SSL certificate
- No certificate errors

### Step 6: Admin Endpoint Protection Test

```bash
# Should return 401
curl http://localhost:8080/api/v1/admin/health

# Should return 200 (with correct secret)
curl -H "X-Admin-Secret: $ADMIN_SECRET" \
  http://localhost:8080/api/v1/admin/health
```

---

## First Transaction Test ("First Dollar" Test)

### 1. Connect Mainnet Wallet

1. Visit: https://app.gstdtoken.com
2. Click "Connect Wallet"
3. Authorize with your mainnet TON wallet
4. Verify connection in dashboard

### 2. Register First Node

1. Go to Dashboard → Devices
2. Click "Register Device"
3. Enter device name (e.g., "Mainnet-Node-1")
4. Copy your **Node ID** from success message

### 3. Create First Task

1. Go to Dashboard → Create Task
2. Select task type (e.g., "AI_INFERENCE")
3. Set budget: **1.0 GSTD** (small test amount)
4. Add optional payload
5. Click "Create Task"
6. **Complete payment** via wallet:
   - Send GSTD to platform wallet
   - Use payment memo from task creation
   - Wait for confirmation (up to 30 seconds)

### 4. Process Task

Run worker script:
```bash
python3 worker.py \
  --node_id YOUR_NODE_ID \
  --api https://app.gstdtoken.com/api/v1
```

**Expected:**
- Worker fetches task
- Task processes
- Result submitted
- Reward distributed (95% to worker)
- Platform fee swapped to XAUt (5%)

### 5. Verify XAUt Swap

**Check Golden Reserve:**
```bash
docker exec -it gstd_db psql -U postgres -d distributed_computing -c \
  "SELECT * FROM golden_reserve_log ORDER BY timestamp DESC LIMIT 1;"
```

**Check Treasury Wallet:**
- Visit: https://tonviewer.com/EQA--JXG8VSyBJmLMqb2J2t4Pya0TS9SXHh7vHh8Iez25sLp
- Verify XAUt balance increased

**Check Public Stats:**
- Visit: https://app.gstdtoken.com/stats
- Verify Golden Reserve shows XAUt balance

---

## Launch Certificate

After successful first transaction, fill out the launch certificate:

**File**: `/LAUNCH_CERTIFICATE_TEMPLATE.md`

**Required Information:**
- Launch date and time
- First transaction details:
  - Task ID
  - Creator wallet
  - Budget and rewards
  - XAUt amount
  - Swap transaction hash
- System status confirmation
- Signatures

---

## Post-Launch Monitoring

### Key Metrics

**Public Stats Page:**
- https://app.gstdtoken.com/stats
- Total tasks completed
- Total workers paid
- Golden Reserve XAUt balance

**Admin Health:**
```bash
curl -H "X-Admin-Secret: $ADMIN_SECRET" \
  http://localhost:8080/api/v1/admin/health
```

**Pending Withdrawals:**
```bash
curl -H "X-Admin-Secret: $ADMIN_SECRET" \
  http://localhost:8080/api/v1/admin/withdrawals/pending
```

### Log Monitoring

```bash
# Backend logs
docker logs -f gstd_backend

# Filter for important events
docker logs gstd_backend | grep -E "Reward|XAUt|Swap|Withdrawal"
```

### Database Queries

```bash
# First transaction
docker exec -it gstd_db psql -U postgres -d distributed_computing -c \
  "SELECT * FROM tasks ORDER BY created_at ASC LIMIT 1;"

# Golden Reserve status
docker exec -it gstd_db psql -U postgres -d distributed_computing -c \
  "SELECT SUM(xaut_amount) as total_xaut FROM golden_reserve_log;"
```

---

## Troubleshooting

### Database Not Clean

```bash
# Manual cleanup
docker exec -it gstd_db psql -U postgres -d distributed_computing -c \
  "TRUNCATE TABLE users, nodes, tasks, golden_reserve_log, failed_payouts, withdrawal_locks CASCADE;"
```

### Services Not Starting

```bash
# Check logs
docker compose logs backend
docker compose logs frontend

# Restart specific service
docker compose restart backend
```

### SSL Issues

```bash
# Check SSL certificate
openssl s_client -connect app.gstdtoken.com:443 -servername app.gstdtoken.com

# Check nginx logs
docker logs nginx
```

### Payment Not Confirming

```bash
# Check payment watcher logs
docker logs gstd_backend | grep -i payment

# Verify task status
docker exec -it gstd_db psql -U postgres -d distributed_computing -c \
  "SELECT task_id, status, payment_memo FROM tasks ORDER BY created_at DESC LIMIT 5;"
```

---

## Success Criteria

✅ Database is clean (all tables empty)  
✅ All services running (backend, frontend, nginx)  
✅ SSL certificate valid  
✅ Admin endpoints protected (401 without secret)  
✅ First wallet connected  
✅ First node registered  
✅ First task created and paid  
✅ First task completed  
✅ First XAUt swap recorded  
✅ Golden Reserve updated  
✅ Public stats page showing data  

---

## Launch Status

**Current Status**: ⚠️ **READY FOR LAUNCH**

**Next Action**: Execute launch sequence and perform first transaction test.

**After Launch**: Fill out launch certificate to document the official mainnet launch.

---

**Good luck with the launch! 🚀**

