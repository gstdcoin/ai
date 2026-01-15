# GSTD Platform - Partner API Guide

This guide is for developers and partners who wish to integrate with the GSTD Decentralized Compute Network to submit tasks programmatically.

## Base URL

`https://app.gstdtoken.com/api/v1`

## Authentication

All requests must include the `X-Session-Token` header.
To obtain a token, you must authenticate via TonConnect (see `/users/login`).

## Key Endpoints

### 1. Submit Task

**POST** `/tasks`

Create a new distributed computing task.

**Body:**
```json
{
  "type": "AI_INFERENCE",
  "model": "gpt2-small",
  "payload": {
    "input": "The future of AI is...",
    "params": { "temperature": 0.7 }
  },
  "bid_amount_gstd": 10.5
}
```

**Response:**
```json
{
  "task_id": "uuid-...",
  "status": "pending",
  "estimated_cost": 10.5
}
```

### 2. Get Task Result

**GET** `/tasks/{id}/result`

Retrieve the computed result.

**Response:**
```json
{
  "task_id": "uuid-...",
  "status": "completed",
  "result": { "output": "...generated text..." },
  "completed_at": "2023-10-27T10:00:00Z"
}
```

### 3. Network Stats

**GET** `/network/stats`

Get real-time network capacity and metrics.

**Response:**
```json
{
  "active_workers": 150,
  "tasks_24h": 1200,
  "total_gstd_paid": 50000.0
}
```

## SDKs

*   **Go SDK**: `github.com/gstdcoin/gstd-sdk-go` (Coming Soon)
*   **JS SDK**: `npm install @gstd/sdk` (Coming Soon)

## Rate Limits

*   Public API: 60 requests/min
*   Authenticated API: 1000 requests/min (Custom quotas available for partners)

## Support

Contact `api-support@gstdtoken.com` for integration assistance.
