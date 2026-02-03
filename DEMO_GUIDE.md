# 🎯 GSTD Platform - Demo Guide for Investors

## Platform URL
**https://app.gstdtoken.com**

---

## 📋 Quick Test Checklist

### 1. Landing Page
- [ ] Logo displays correctly (gold handshake coin)
- [ ] "Connect Wallet" button is centered
- [ ] "Read Documentation" button is centered
- [ ] Network stats show real data
- [ ] Language switcher works (EN/RU)

### 2. Connect Wallet
1. Click "Connect Wallet"
2. Select TON wallet (Tonkeeper recommended)
3. Confirm connection
4. Dashboard should load

### 3. Dashboard Verification
- [ ] TON Balance shows real balance from wallet
- [ ] GSTD Balance shows platform balance
- [ ] Treasury widget shows contract balance (~0.67 TON)
- [ ] Pool Status shows healthy

### 4. Create Task (Full Cycle Demo)
1. Click "+" button (create task)
2. Fill in:
   - Type: AI_INFERENCE
   - Budget: 0.1 TON
   - Payload: Any text
3. Submit task
4. Pay with TON from wallet
5. Task moves to "queued" status

### 5. Worker Flow (Requires device registration)
1. Go to "Devices" tab
2. Register new device
3. Go to "Tasks" → "Available" filter
4. Click "Start Work" on a task
5. Task executes in browser
6. Result submitted with cryptographic proof
7. Reward credited to worker

### 6. BOINC Bridge (Scientific Computing)
1. Go to "Marketplace" → "BOINC Bridge" tab
2. Fill in BOINC project details (URL, Auth Key)
3. Submit and pay for scientific task
4. Platform bridging starts - status updates from Rosetta/SETI/etc.

### 7. Physical Agent (OpenClaw)
1. In terminal: `python A2A/openclaw_bridge.py`
2. Watch it register as a new "Physical Control Node"
3. Create a task of type `openclaw-control`
4. Verify the bridge script receives the command and executes it

---

## 🔑 API Test Commands

### Health Check
```bash
curl https://app.gstdtoken.com/api/v1/health
```

### Login (get session)
```bash
curl -X POST https://app.gstdtoken.com/api/v1/users/login \
  -H "Content-Type: application/json" \
  -d '{"connect_payload": {"wallet_address": "YOUR_WALLET", "public_key": "test", "payload": "test", "signature": {"signature": "simple_connect", "type": "simple"}}}'
```

### Get Balance
```bash
curl https://app.gstdtoken.com/api/v1/users/balance \
  -H "X-Session-Token: YOUR_TOKEN"
```

### Get Tasks
```bash
curl https://app.gstdtoken.com/api/v1/tasks \
  -H "X-Session-Token: YOUR_TOKEN"
```

### Create Task
```bash
curl -X POST https://app.gstdtoken.com/api/v1/tasks/create \
  -H "Content-Type: application/json" \
  -H "X-Session-Token: YOUR_TOKEN" \
  -H "X-Wallet-Address: YOUR_WALLET" \
  -d '{"type": "AI_INFERENCE", "budget": 0.1, "payload": {"text": "Test"}}'
```

---

## 📊 Platform Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        GSTD Platform                            │
├─────────────────────────────────────────────────────────────────┤
│  Frontend (Next.js)     │  2x instances with health checks      │
├─────────────────────────────────────────────────────────────────┤
│  Backend (Go/Gin)       │  7x instances (blue/green deploy)     │
├─────────────────────────────────────────────────────────────────┤
│  Nginx LB               │  Load balancer with SSL (Let's Encrypt)│
├─────────────────────────────────────────────────────────────────┤
│  PostgreSQL             │  Main database                        │
├─────────────────────────────────────────────────────────────────┤
│  Redis                  │  Session cache                        │
├─────────────────────────────────────────────────────────────────┤
│  Smart Contract         │  TON blockchain (0.67 TON balance)    │
└─────────────────────────────────────────────────────────────────┘
```

---

## ✅ Current Status

| Component | Status |
|-----------|--------|
| Frontend | ✅ Healthy (2 instances) |
| Backend | ✅ Healthy (7 instances) |
| Database | ✅ Connected |
| Redis | ✅ Connected |
| Smart Contract | ✅ Reachable (0.67 TON) |
| BOINC Bridge | ✅ Active |
| SSL Certificate | ✅ Valid until March 2026 |
| CI/CD | ✅ Auto-deploys on push |

---

## 🚀 Key Features

1. **Distributed Computing** - Execute AI tasks across global network
2. **Cryptographic Proofs** - Every result has verifiable proof
3. **TON Blockchain** - Secure payment settlement
4. **Real-time Stats** - Live network monitoring
5. **Referral System** - Earn from referrals
6. **Multi-language** - English/Russian support
7. **Blue/Green Deploy** - Zero-downtime updates
8. **BOINC Bridge** - Support scientific research (Rosetta@home, etc.)

---

*Platform ready for investor demo!*
