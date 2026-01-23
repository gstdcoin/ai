# GSTD Platform API Documentation

## Base URL
```
Production: https://app.gstdtoken.com/api/v1
Development: http://localhost:8080/api/v1
```

## Authentication
Most endpoints require wallet authentication via `X-Wallet-Address` header or `wallet_address` query parameter.

## Rate Limiting
- General endpoints: 30 requests/second
- API endpoints: 10 requests/second
- Admin endpoints: 5 requests/second

## Endpoints

### Health & Metrics

#### GET /health
Get platform health status.

**Response:**
```json
{
  "status": "healthy",
  "database": {
    "status": "connected"
  },
  "contract": {
    "address": "EQAIYlrr3UiMJ9fqI-B4j2nJdiiD7WzyaNL1MX_wiONc4OUi",
    "balance_gstd": 0.786691287,
    "status": "reachable"
  },
  "timestamp": 1768119044
}
```

#### GET /metrics
Get Prometheus-compatible metrics.

**Response:** Prometheus text format

### Tasks

#### POST /tasks/create
Create a new task with payment flow (recommended).

**Query Parameters:**
- `wallet_address` (required): Wallet address of the task creator

**Request:**
```json
{
  "type": "AI_INFERENCE",
  "budget": 10.5,
  "payload": {
    "input": "data",
    "model": "gpt-4"
  }
}
```

**Response:**
```json
{
  "task_id": "uuid",
  "status": "pending_payment",
  "payment_memo": "TASK-uuid",
  "amount": 10.5,
  "platform_wallet": "EQ..."
}
```

**Payment Flow:**
1. User receives `payment_memo` and `platform_wallet`
2. User sends GSTD tokens to `platform_wallet` with `payment_memo` in transaction comment
3. PaymentWatcher detects payment and updates task status to `queued`
4. Task becomes available for workers

#### POST /tasks
Create a new task (legacy endpoint, requires escrow deposit).

**Request:**
```json
{
  "requester_address": "EQ...",
  "task_type": "inference",
  "operation": "image_classification",
  "model": "resnet50",
  "input_source": "hash",
  "input_hash": "abc123...",
  "time_limit_sec": 300,
  "max_energy_mwh": 100,
  "labor_compensation_gstd": 0.1,
  "validation_method": "majority"
}
```

**Response:**
```json
{
  "task_id": "uuid",
  "status": "awaiting_escrow",
  "created_at": "2026-01-11T12:00:00Z"
}
```

#### GET /tasks
Get list of tasks.

**Query Parameters:**
- `requester_address` (optional): Filter by requester

**Response:**
```json
{
  "tasks": [
    {
      "task_id": "uuid",
      "task_type": "ai_inference",
      "status": "pending",
      "labor_compensation_gstd": 0.1,
      "created_at": "2026-01-11T12:00:00Z"
    }
  ]
}
```

#### GET /tasks/:id
Get task by ID.

**Response:**
```json
{
  "task_id": "uuid",
  "task_type": "ai_inference",
  "status": "pending",
  "labor_compensation_gstd": 0.1,
  "created_at": "2026-01-11T12:00:00Z"
}
```

### Devices

#### POST /devices/register
Register a new device.

**Request:**
```json
{
  "device_type": "cpu",
  "device_specs": {
    "cpu_cores": 4,
    "ram_gb": 8
  }
}
```

#### GET /devices
Get list of devices.

#### GET /devices/my
Get my devices (requires wallet authentication).

### Statistics

#### GET /stats
Get platform statistics (requires wallet authentication).

#### GET /stats/public
Get public platform statistics.

**Response:**
```json
{
  "total_tasks_completed": 1000,
  "total_workers_paid": 50,
  "total_gstd_paid": 100.5,
  "golden_reserve_xaut": 10.2,
  "system_status": "Operational"
}
```

### Payments

#### POST /payments/payout-intent
Create payout intent for completed task.

**Request:**
```json
{
  "task_id": "uuid",
  "executor_address": "UQ..."
}
```

**Response:**
```json
{
  "payout_intent": {
    "task_id": "uuid",
    "executor_address": "UQ...",
    "executor_reward_gstd": 0.095,
    "platform_fee_gstd": 0.005,
    "total_gstd": 0.1
  }
}
```

### Nodes

#### POST /nodes/register
Register a computing node.

**Request:**
```json
{
  "name": "My Node",
  "specs": {
    "cpu": "Intel i7-9700K",
    "ram": 16
  }
}
```

#### GET /nodes/my
Get my nodes (requires wallet authentication).

### WebSocket

#### GET /ws
WebSocket connection for real-time task updates.

**Protocol:** WebSocket
**Message Format:**
```json
{
  "type": "task_available",
  "task_id": "uuid",
  "task_type": "ai_inference"
}
```

## Error Responses

All errors follow this format:
```json
{
  "error": "Error message"
}
```

**Status Codes:**
- `200` - Success
- `400` - Bad Request
- `401` - Unauthorized
- `404` - Not Found
- `500` - Internal Server Error
- `503` - Service Unavailable

## Rate Limiting

Rate limits are enforced per IP address:
- General: 30 req/s
- API: 10 req/s
- Admin: 5 req/s

When rate limit is exceeded, response:
```json
{
  "error": "Rate limit exceeded"
}
```
Status: `429 Too Many Requests`
