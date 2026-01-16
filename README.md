# GSTD Platform - Documentation

## Overview

GSTD Platform is a decentralized distributed computing infrastructure built on the TON blockchain. It enables:
- **Task Creators**: Submit AI inference, data validation, and processing tasks
- **Workers**: Earn TON by executing computational tasks
- **Enterprises**: Scale AI workloads across a global network of nodes

## Quick Start

### For Task Creators

1. **Connect Wallet**: Use TON wallet (Tonkeeper, OpenMask, etc.) via TonConnect
2. **Create Task**: Use Web UI or API to submit tasks
3. **Pay**: Deposit task budget in TON
4. **Get Results**: Receive cryptographically verified results

### For Workers

1. **Connect Wallet**: Connect your TON wallet
2. **Register Device**: Add your device as a computing node
3. **Auto-Execute**: Tasks are automatically assigned and executed
4. **Withdraw**: Claim earnings in TON

## API Documentation

### Base URL
```
https://app.gstdtoken.com/api/v1
```

### Authentication
All protected endpoints require a session token obtained via login.

### Endpoints

#### Health Check
```http
GET /health
```
Returns platform status and contract balance.

#### Create Task
```http
POST /tasks/create
Content-Type: application/json

{
  "type": "AI_INFERENCE",
  "model": "gpt-4",
  "payload": {
    "prompt": "Your prompt here",
    "max_tokens": 100
  },
  "budget_ton": 0.5,
  "priority": 10,
  "min_trust_score": 0.8
}
```

#### Get Tasks
```http
GET /tasks?wallet_address=YOUR_WALLET&status=queued
```

#### Register Device
```http
POST /nodes/register
Content-Type: application/json

{
  "wallet_address": "YOUR_WALLET",
  "name": "My GPU Server",
  "cpu_model": "AMD Ryzen 9",
  "ram_gb": 64,
  "capabilities": ["AI_INFERENCE", "DATA_VALIDATION"]
}
```

#### Submit Task Result
```http
POST /tasks/{task_id}/result
Content-Type: application/json

{
  "wallet_address": "WORKER_WALLET",
  "result": "Task execution result",
  "signature": "Ed25519 signature"
}
```

### SDK

TypeScript SDK available at `/gstd-sdk/`:

```typescript
import { GSTDClient } from '@gstd/sdk';

const client = new GSTDClient({
  apiUrl: 'https://app.gstdtoken.com/api/v1',
  wallet: tonConnectUI
});

// Create task
const task = await client.createTask({
  type: 'AI_INFERENCE',
  payload: { prompt: 'Hello' },
  budget: 0.5
});

// Watch for results
client.onResult(task.id, (result) => {
  console.log('Task completed:', result);
});
```

## Smart Contracts

### Escrow Contract
Address: `UQCkXFlNRsubUp7Uh7lg_ScUqLCiff1QCLsdQU0a7kphqQED`

The escrow contract handles:
- Task payment deposits
- Worker reward distribution
- Platform fee collection
- Replay attack prevention

### GSTD Token
Address: `EQDv6cYW9nNiKjN3Nwl8D6ABjUiH1gYfWVGZhfP7-9tZskTO`

GSTD is a utility token for:
- Paying for computational services
- Staking for priority access
- Governance participation

## Task Types

| Type | Description | Avg Time |
|------|-------------|----------|
| `AI_INFERENCE` | Run AI model inference | 3-10s |
| `DATA_VALIDATION` | Validate data integrity | 1-5s |
| `CONTENT_MODERATION` | AI content analysis | 2-8s |
| `NETWORK_PROBING` | Network connectivity tests | 1-3s |
| `CUSTOM` | Custom WebAssembly tasks | varies |

## Security

- **Encryption**: AES-256-GCM end-to-end encryption
- **Signatures**: Ed25519 digital signatures
- **Validation**: Multi-node result validation
- **Escrow**: Smart contract payment protection

## Rate Limits

| Tier | Requests/min | Tasks/day |
|------|--------------|-----------|
| Free | 100 | 1000 |
| Pro | 1000 | 10000 |
| Enterprise | Unlimited | Unlimited |

## Support

- Telegram: @gstdtoken_bot
- GitHub: github.com/gstdcoin/ai
- Email: support@gstdtoken.com

---

© 2026 GSTD Platform. All rights reserved.
