# Mainnet Launch Guide

## Pre-Launch Checklist

### 1. Environment Configuration

Update `.env` file with mainnet addresses:

```bash
# Mainnet Network
TON_NETWORK=mainnet

# Mainnet Jetton Addresses
XAUT_JETTON_MASTER=EQCyD8v6khUUrce9BCvHOaBC9PrvlV9S7D5v67O80p444XAr
GSTD_JETTON_ADDRESS=<your-mainnet-jetton-address>
STONFI_ROUTER=EQA98Z99S-9u1As_7p8n7H_H_H_H_H_H_H_H_H_H_H_H_H_H_

# Treasury Wallet
TREASURY_WALLET=EQA--JXG8VSyBJmLMqb2J2t4Pya0TS9SXHh7vHh8Iez25sLp

# Security Settings
WITHDRAWAL_LOCK_THRESHOLD=500.0  # GSTD threshold for manual approval
ADMIN_SECRET=your_super_secret_string_here  # Secret for admin API access

# API Keys
TON_API_KEY=<your-tonapi-key>
```

### 2. Database Cleanup

Run the production cleanup script to reset all test data:

```bash
./scripts/production_ready.sh
```

This will:
- Truncate all tables (users, tasks, nodes, failed_payouts, golden_reserve_log)
- Reset all auto-incrementing IDs
- Prepare database for Launch Transaction #1

### 3. Run Database Migration

Apply the withdrawal_locks migration:

```bash
docker exec -i gstd_db psql -U postgres -d distributed_computing < backend/migrations/v11_withdrawal_locks.sql
```

### 4. Verify Configuration

Check that all services are configured correctly:

```bash
# Check backend logs
docker logs gstd_backend | grep -i "mainnet\|config"

# Verify database is clean
docker exec -it gstd_db psql -U postgres -d distributed_computing -c \
  "SELECT COUNT(*) FROM tasks; SELECT COUNT(*) FROM users;"
```

### 5. Restart Services

Restart all services to load new configuration:

```bash
docker-compose restart backend
```

## Launch Verification

### Step 1: Connect Mainnet Wallet

1. Visit [app.gstdtoken.com](https://app.gstdtoken.com)
2. Connect your mainnet TON wallet
3. Verify connection in dashboard

### Step 2: Register Node

1. Go to Dashboard → Devices
2. Register a computing node
3. Copy your Node ID

### Step 3: Create First Task

1. Create a test task with small budget (e.g., 1 GSTD)
2. Complete payment via mainnet wallet
3. Wait for payment confirmation

### Step 4: Process Task

1. Run worker script:
   ```bash
   python3 worker.py --node_id YOUR_NODE_ID --api https://app.gstdtoken.com/api/v1
   ```
2. Worker should pick up and process the task
3. Verify task completion in dashboard

### Step 5: Verify XAUt Swap

1. Check Golden Reserve log:
   ```bash
   docker exec -it gstd_db psql -U postgres -d distributed_computing -c \
     "SELECT * FROM golden_reserve_log ORDER BY timestamp DESC LIMIT 1;"
   ```

2. Verify on Tonviewer:
   - Treasury Wallet: [EQA--JXG8VSyBJmLMqb2J2t4Pya0TS9SXHh7vHh8Iez25sLp](https://tonviewer.com/EQA--JXG8VSyBJmLMqb2J2t4Pya0TS9SXHh7vHh8Iez25sLp)
   - Check jetton balance for XAUt

3. Verify swap transaction:
   - Use `swap_tx_hash` from golden_reserve_log
   - View on [Tonviewer](https://tonviewer.com)

## Security Features

### Withdrawal Lock

Large payouts (> 500 GSTD) are automatically locked for manual approval:
- Check `withdrawal_locks` table for pending approvals
- Approve via admin interface or database update

### Error Sanitization

All API errors are sanitized to prevent information leakage:
- File paths removed
- Database connection strings hidden
- Stack traces truncated

## Monitoring

### Public Stats

- View at: [app.gstdtoken.com/stats](https://app.gstdtoken.com/stats)
- Shows: Total tasks, workers paid, Golden Reserve, Last Swap feed

### Admin Health

- Endpoint: `GET /api/v1/admin/health`
- Returns: Database status, Redis status, last 5 swaps, pending retries

### Logs

```bash
# Backend logs
docker logs -f gstd_backend

# Filter for specific events
docker logs gstd_backend | grep -E "Reward|XAUt|Swap|Retry"
```

## Post-Launch

### Monitor First Transactions

1. Verify Launch Transaction #1 in database
2. Check reward distribution (95/5 split)
3. Verify XAUt swap execution
4. Confirm Golden Reserve accumulation

### Community Announcement

- Share public stats page
- Announce Golden Reserve verification link
- Provide worker setup instructions

## Troubleshooting

### Payment Not Confirmed

- Check PaymentWatcher logs
- Verify payment memo matches task
- Check TonAPI connection

### Swap Failed

- Check STON.fi API status
- Verify router address
- Check treasury wallet balance

### Large Payout Locked

- Check `withdrawal_locks` table
- Approve via admin interface
- Verify threshold setting

---

**Ready for Mainnet Launch! 🚀**

