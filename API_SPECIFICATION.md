# API Спецификация

## Базовый URL
```
Production: https://api.platform.com/v1
Testnet: https://api-testnet.platform.com/v1
```

## Аутентификация

Все запросы требуют подписи кошельком:
```
Authorization: Bearer <wallet_signature>
X-Wallet-Address: <wallet_address>
X-Timestamp: <unix_timestamp>
X-Nonce: <random_nonce>
```

Подпись формируется как:
```
message = wallet_address + timestamp + nonce + request_body_hash
signature = wallet.sign(message)
```

## Endpoints

### 1. Заказчик API

#### POST /tasks
Создание нового задания

**Request:**
```json
{
  "task_type": "inference",
  "operation": "classify_text",
  "model": "light-nlp-v1",
  "input": {
    "source": "ipfs",
    "hash": "QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco"
  },
  "constraints": {
    "time_limit_sec": 5,
    "max_energy_mwh": 10
  },
  "reward": {
    "amount_ton": 0.05
  },
  "validation": "cross_check"
}
```

**Response:**
```json
{
  "task_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "pending",
  "priority_score": 0.85,
  "estimated_completion_time": "2024-01-01T12:00:00Z",
  "escrow_address": "EQD...",
  "escrow_amount_ton": 0.05
}
```

**Errors:**
- `400 Bad Request`: Невалидный JSON-дескриптор
- `401 Unauthorized`: Неверная подпись
- `402 Payment Required`: Недостаточно TON в escrow
- `403 Forbidden`: Недостаточно GSTD stake

#### GET /tasks/{task_id}
Получение статуса задания

**Response:**
```json
{
  "task_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "completed",
  "created_at": "2024-01-01T10:00:00Z",
  "assigned_at": "2024-01-01T10:00:05Z",
  "completed_at": "2024-01-01T10:00:10Z",
  "result": {
    "classification": "positive",
    "confidence": 0.95
  },
  "validation": {
    "status": "passed",
    "method": "cross_check",
    "validated_at": "2024-01-01T10:00:12Z"
  },
  "payment": {
    "status": "completed",
    "tx_hash": "0x...",
    "amount_ton": 0.05
  }
}
```

#### GET /tasks
Список заданий заказчика

**Query Parameters:**
- `status`: pending, assigned, executing, validating, completed, failed
- `limit`: количество (default: 50, max: 100)
- `offset`: смещение (default: 0)

**Response:**
```json
{
  "tasks": [
    {
      "task_id": "550e8400-e29b-41d4-a716-446655440000",
      "status": "completed",
      "created_at": "2024-01-01T10:00:00Z",
      "reward_amount_ton": 0.05
    }
  ],
  "total": 100,
  "limit": 50,
  "offset": 0
}
```

#### POST /tasks/{task_id}/cancel
Отмена задания (только если статус pending)

**Response:**
```json
{
  "task_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "cancelled",
  "refund_amount_ton": 0.05,
  "refund_tx_hash": "0x..."
}
```

### 2. Устройство API

#### GET /device/tasks/available
Получение доступных заданий для устройства

**Response:**
```json
{
  "tasks": [
    {
      "task_id": "550e8400-e29b-41d4-a716-446655440000",
      "task_type": "inference",
      "operation": "classify_text",
      "model": "light-nlp-v1",
      "input": {
        "source": "ipfs",
        "hash": "QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco"
      },
      "constraints": {
        "time_limit_sec": 5,
        "max_energy_mwh": 10
      },
      "reward": {
        "amount_ton": 0.05
      }
    }
  ]
}
```

#### POST /device/tasks/{task_id}/claim
Заявка на выполнение задания

**Request:**
```json
{
  "device_id": "fingerprint",
  "estimated_time_ms": 3000,
  "cached_models": ["light-nlp-v1"]
}
```

**Response:**
```json
{
  "assignment_id": "660e8400-e29b-41d4-a716-446655440001",
  "task_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "assigned",
  "deadline": "2024-01-01T10:00:05Z"
}
```

#### POST /device/tasks/{task_id}/result
Отправка результата выполнения

**Request:**
```json
{
  "assignment_id": "660e8400-e29b-41d4-a716-446655440001",
  "result": {
    "classification": "positive",
    "confidence": 0.95
  },
  "proof": {
    "device_id": "fingerprint",
    "timestamp": 1704110400,
    "signature": "0x...",
    "energy_consumed": 8,
    "execution_time_ms": 2500
  }
}
```

**Response:**
```json
{
  "assignment_id": "660e8400-e29b-41d4-a716-446655440001",
  "status": "validating",
  "validation_estimated_time": "2024-01-01T10:00:12Z"
}
```

#### GET /device/tasks/{task_id}/status
Статус выполнения задания

**Response:**
```json
{
  "assignment_id": "660e8400-e29b-41d4-a716-446655440001",
  "status": "completed",
  "validation_status": "passed",
  "payment_status": "completed",
  "payment_tx_hash": "0x...",
  "reward_amount_ton": 0.0525
}
```

### 3. Публичный API

#### GET /whitelist/operations
Список разрешённых операций

**Response:**
```json
{
  "operations": [
    {
      "operation": "classify_text",
      "description": "Классификация текста",
      "supported_models": ["light-nlp-v1", "light-nlp-v2"],
      "average_time_ms": 2000,
      "average_energy_mwh": 5
    },
    {
      "operation": "detect_objects",
      "description": "Детекция объектов на изображении",
      "supported_models": ["light-cv-v1"],
      "average_time_ms": 3000,
      "average_energy_mwh": 8
    }
  ]
}
```

#### GET /whitelist/models
Список разрешённых моделей

**Response:**
```json
{
  "models": [
    {
      "model": "light-nlp-v1",
      "size_mb": 10,
      "operations": ["classify_text", "sentiment_analysis"],
      "ipfs_hash": "Qm..."
    }
  ]
}
```

#### GET /stats
Публичная статистика платформы

**Response:**
```json
{
  "total_tasks": 1000000,
  "completed_tasks": 950000,
  "active_devices": 50000,
  "total_ton_distributed": 50000.0,
  "average_task_time_ms": 2500,
  "average_reward_ton": 0.05
}
```

### 4. Валидация

#### POST /validation/human/{task_id}
Человеческая валидация (для заказчика)

**Request:**
```json
{
  "result": true,
  "comment": "Результат корректен"
}
```

**Response:**
```json
{
  "validation_id": "770e8400-e29b-41d4-a716-446655440002",
  "status": "completed",
  "payment_initiated": true
}
```

## WebSocket API

### Подключение
```
wss://api.platform.com/v1/ws
```

### События

#### Устройство подписывается на задания
```json
{
  "type": "subscribe",
  "channel": "tasks",
  "device_id": "fingerprint"
}
```

#### Сервер отправляет задание
```json
{
  "type": "task_assigned",
  "task_id": "550e8400-e29b-41d4-a716-446655440000",
  "task": {...}
}
```

#### Устройство отправляет результат
```json
{
  "type": "result_submitted",
  "task_id": "550e8400-e29b-41d4-a716-446655440000",
  "assignment_id": "660e8400-e29b-41d4-a716-446655440001"
}
```

#### Сервер отправляет статус валидации
```json
{
  "type": "validation_completed",
  "task_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "passed",
  "payment_tx_hash": "0x..."
}
```

## Rate Limiting

- Заказчик: 100 запросов/минуту
- Устройство: 1000 запросов/минуту
- Публичный API: 10 запросов/минуту

## Коды ошибок

- `400 Bad Request`: Невалидный запрос
- `401 Unauthorized`: Неверная подпись
- `402 Payment Required`: Недостаточно средств
- `403 Forbidden`: Недостаточно прав
- `404 Not Found`: Ресурс не найден
- `409 Conflict`: Конфликт состояния
- `429 Too Many Requests`: Превышен лимит запросов
- `500 Internal Server Error`: Внутренняя ошибка сервера
- `503 Service Unavailable`: Сервис недоступен



