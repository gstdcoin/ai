# 🌉 GSTD Sovereign Compute Bridge

**Автономный протокол для AI-ассистентов (MoltBot) для потребления вычислительных ресурсов GSTD**

---

## 🎯 Обзор

Sovereign Compute Bridge превращает сеть GSTD в невидимый вычислительный слой для AI-ассистентов. MoltBot может автономно:

1. **Находить исполнителей** через Discovery API
2. **Покупать GSTD** автоматически через DEX (Invisible Swap)
3. **Выполнять задачи** с криптографической верификацией
4. **Оплачивать работу** через escrow смарт-контракты

---

## 📦 Установка

### Python (MoltBot Skill)

```bash
pip install gstd-bridge
# или из локального SDK:
pip install /path/to/gstd-sdk/moltbot
```

### Переменные окружения

```bash
export GSTD_API_URL="https://app.gstdtoken.com/api/v1"
export GSTD_WALLET_ADDRESS="UQА..."
export GSTD_API_KEY="your_optional_api_key"
```

---

## 🚀 Быстрый старт

### Python

```python
import asyncio
from gstd_bridge import GSTDBridge

async def main():
    # Инициализация
    bridge = GSTDBridge(
        wallet_address="UQА...",
        auto_swap_enabled=True,  # Авто-покупка GSTD
        max_auto_swap_ton=10.0   # Лимит на авто-свап
    )
    
    # Подключение
    await bridge.init()
    
    # Выполнение задачи (всё автоматически!)
    result = await bridge.execute(
        task_type="inference",
        payload={"prompt": "Напиши стихотворение о космосе"},
        max_budget_gstd=5.0
    )
    
    print(f"Результат: {result.result_data}")
    print(f"Стоимость: {result.actual_cost_gstd} GSTD")
    
    await bridge.close()

asyncio.run(main())
```

---

## 📡 API Reference

### Инициализация Bridge

```http
POST /api/v1/bridge/init
```

**Request:**
```json
{
    "client_id": "moltbot_abc123",
    "client_wallet": "UQА...",
    "api_key": "optional_key"
}
```

**Response:**
```json
{
    "success": true,
    "session_token": "uuid-session-token",
    "bridge_status": {
        "is_online": true,
        "active_workers": 42,
        "available_capacity_pflops": 441.0,
        "genesis_node_online": true
    },
    "liquidity": {
        "gstd_balance": 150.0,
        "available_gstd": 145.0,
        "auto_swap_enabled": true
    },
    "capabilities": ["inference", "render", "compute", "docker", "gpu"]
}
```

---

### Discovery & Matchmaking

```http
POST /api/v1/bridge/match
GET /api/v1/network/match  (legacy)
```

**Request:**
```json
{
    "task_type": "inference",
    "capabilities": ["gpu", "docker"],
    "min_reputation": 0.8,
    "max_latency_ms": 200,
    "prefer_region": "EU"
}
```

**Response:**
```json
{
    "success": true,
    "worker": {
        "worker_id": "worker-uuid",
        "endpoint": "https://worker.example.com",
        "reservation_token": "reservation-uuid",
        "capabilities": ["gpu", "docker", "inference"],
        "reputation": 0.95,
        "latency_ms": 45,
        "price_per_unit_gstd": 0.15,
        "expires_at": "2026-02-01T06:00:00Z"
    }
}
```

---

### Invisible Swap (Auto Liquidity)

```http
POST /api/v1/bridge/liquidity
```

**Request:**
```json
{
    "wallet_address": "UQА...",
    "required_gstd": 50.0,
    "auto_swap": true
}
```

**Response (достаточно средств):**
```json
{
    "success": true,
    "status": {
        "gstd_balance": 150.0,
        "available_gstd": 145.0,
        "ton_balance": 25.0
    },
    "required": 50.0
}
```

**Response (выполнен auto-swap):**
```json
{
    "success": true,
    "auto_swapped": true,
    "swap": {
        "tx_hash": "swap_abc123...",
        "amount_in_ton": 5.0,
        "amount_out_gstd": 48.5,
        "rate": 9.7,
        "executed_at": "2026-02-01T05:30:00Z"
    },
    "status": {
        "gstd_balance": 198.5,
        "available_gstd": 193.5
    }
}
```

---

### Отправка задачи

```http
POST /api/v1/bridge/submit
```

**Request:**
```json
{
    "client_id": "moltbot_abc123",
    "client_wallet": "UQА...",
    "session_token": "session-uuid",
    "task_type": "render",
    "payload": "{\"prompt\": \"3D модель робота\"}",
    "capabilities": ["gpu"],
    "min_reputation": 0.7,
    "max_budget_gstd": 25.0,
    "priority": "high",
    "timeout_seconds": 600,
    "metadata": {
        "source": "telegram_bot"
    }
}
```

**Response:**
```json
{
    "success": true,
    "task_id": "task-uuid",
    "status": "processing",
    "worker_id": "worker-uuid",
    "payload_hash": "sha256...",
    "created_at": "2026-02-01T05:35:00Z"
}
```

---

### Callback от воркера

```http
POST /api/v1/bridge/callback/{task_id}
```

**Request (от воркера):**
```json
{
    "result_hash": "sha256_of_result",
    "result_encrypted": "base64_encrypted_data",
    "success": true,
    "execution_time_ms": 4523,
    "cost_gstd": 12.5
}
```

---

### Escrow Release

```http
POST /api/v1/escrow/release
```

**Request:**
```json
{
    "task_id": "task-uuid",
    "worker_wallet": "worker-wallet-address",
    "result_hash": "sha256_verification"
}
```

---

## 🔐 Безопасность

### Шифрование Payload

Все payload шифруются AES-256-GCM:

```python
# Клиент → Воркер
encrypted_payload = encrypt(
    payload=task_data,
    key=derive_key(bridge_secret),
    aad=worker_wallet  # Associated data
)
```

### Верификация результата

```python
# Воркер → Клиент
result_hash = sha256(result_encrypted)
if received_hash != computed_hash:
    trigger_dispute(task_id)
```

### Escrow Protection

1. Клиент блокирует `max_budget_gstd` в escrow
2. Воркер выполняет задачу
3. Bridge верифицирует `result_hash`
4. Смарт-контракт освобождает `actual_cost_gstd` воркеру
5. Остаток возвращается клиенту

---

## 🏗️ Архитектура

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│     MoltBot     │────▶│   Bridge API     │────▶│    Worker       │
│   (Telegram)    │◀────│   (Go Backend)   │◀────│    Network      │
└─────────────────┘     └──────────────────┘     └─────────────────┘
        │                       │                        │
        │                       ▼                        │
        │              ┌────────────────┐                │
        │              │  Redis Cache   │                │
        │              │  (Reservations)│                │
        │              └────────────────┘                │
        │                       │                        │
        ▼                       ▼                        ▼
┌─────────────────┐    ┌────────────────┐    ┌─────────────────┐
│   TON Wallet    │    │   PostgreSQL   │    │  Genesis Node   │
│   (TonConnect)  │    │   (Tasks/Swaps)│    │   (Fallback)    │
└─────────────────┘    └────────────────┘    └─────────────────┘
        │                       │
        ▼                       │
┌─────────────────┐             │
│  STON.fi DEX    │◀────────────┘
│  (Auto-Swap)    │
└─────────────────┘
```

---

## 📊 Типы задач

| Task Type | Capabilities | Avg Cost | Use Case |
|-----------|-------------|----------|----------|
| `inference` | gpu, inference | 0.5-5 GSTD | LLM запросы, классификация |
| `render` | gpu | 5-50 GSTD | 3D рендеринг, генерация изображений |
| `compute` | docker | 0.1-10 GSTD | Произвольный код, скрипты |
| `train` | gpu, hpc | 50-500 GSTD | Fine-tuning моделей |
| `validate` | any | 0.01-0.1 GSTD | Верификация данных |

---

## 🎬 Пример для демо-видео

```python
# MoltBot "нанимает" компьютеры через GSTD

async def demo_autonomous_hire():
    print("🤖 MoltBot: Получена команда 'Срендери это'")
    
    async with GSTDBridge(wallet_address="...") as bridge:
        # 1. Автоматический поиск воркера
        print("🔍 Поиск GPU-воркера...")
        worker = await bridge.find_worker(
            task_type="render",
            capabilities=["gpu"],
            min_reputation=0.8
        )
        print(f"✅ Найден: {worker.worker_id} (rep={worker.reputation})")
        
        # 2. Проверка/покупка GSTD
        print("💧 Проверка баланса...")
        liquidity, swap = await bridge.ensure_liquidity(required_gstd=20)
        if swap:
            print(f"💱 Auto-swap: {swap.amount_in_ton} TON → {swap.amount_out_gstd} GSTD")
        
        # 3. Отправка задачи
        print("📤 Отправка задачи...")
        task = await bridge.execute(
            task_type="render",
            payload={"prompt": "Футуристический город на закате"},
            max_budget_gstd=20
        )
        
        # 4. Результат
        print(f"🎨 Рендер готов!")
        print(f"💰 Оплачено: {task.actual_cost_gstd} GSTD")
        print(f"🔗 Tx: {task.metadata.get('payment_tx')}")
```

**Что показать:**
1. MoltBot получает команду в Telegram
2. Автоматически находит исполнителя
3. Покупает GSTD если нужно
4. Отправляет задачу
5. Получает результат
6. Оплачивает работу

---

## 🔧 Конфигурация

### Переменные окружения (Backend)

```bash
# Bridge
BRIDGE_ENCRYPTION_KEY=your-32-byte-encryption-key
GENESIS_NODE_ENDPOINT=https://genesis.gstd.network

# Auto-swap (STON.fi)
STONFI_ROUTER_ADDRESS=EQA...
GSTD_CONTRACT_ADDRESS=EQА...

# Redis
REDIS_URL=redis://localhost:6379
```

### Python SDK

```python
bridge = GSTDBridge(
    api_url="https://app.gstdtoken.com/api/v1",
    wallet_address="UQА...",
    api_key="optional",
    client_id="moltbot_unique_id",
    auto_swap_enabled=True,
    max_auto_swap_ton=10.0,
    timeout_seconds=30
)
```

---

## 📈 Метрики

Bridge собирает метрики для аналитики:

```sql
SELECT * FROM bridge_metrics WHERE metric_date = CURRENT_DATE;
```

| Метрика | Описание |
|---------|----------|
| `total_tasks` | Всего задач за день |
| `completed_tasks` | Успешно выполнено |
| `total_gstd_spent` | Потрачено GSTD |
| `total_swaps` | Количество auto-swap |
| `unique_clients` | Уникальные клиенты |
| `avg_task_duration_ms` | Среднее время выполнения |

---

## 🚧 Roadmap

- [ ] TonConnect интеграция для подписи свапов
- [ ] Мультиподпись для крупных задач
- [ ] Streaming результатов для длинных задач
- [ ] WebSocket уведомления о статусе
- [ ] Telegram Mini App интеграция
- [ ] Batch задачи

---

## 📞 Поддержка

- Telegram: [@gstd_support](https://t.me/gstd_support)
- GitHub: [gstdcoin/sovereign-bridge](https://github.com/gstdcoin/sovereign-bridge)
- API Status: [status.gstd.network](https://status.gstd.network)
