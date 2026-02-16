# Universal Mesh Protocol

**Версия:** 1.0  
**Дата:** 15 февраля 2026  
**Статус:** Активирован

---

## 1. Обзор

Universal Mesh — протокол коллективной обработки запросов на распределённой сети GSTD. Любой пользователь может отправить промпт, сеть обрабатывает его коллективно (Mobile + PC + Server), модель дообучается федеративно, а ноды получают долю XAUt пропорционально вкладу.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     GET /api/v1/infer?prompt=...                         │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    Universal Mesh Orchestrator                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                   │
│  │   Mobile     │  │   Desktop    │  │   Server     │                   │
│  │   (JS Worker)│  │   (Node)     │  │   (Go/Ollama)│                   │
│  │   Light tasks │  │   Medium     │  │   Heavy      │                   │
│  └──────────────┘  └──────────────┘  └──────────────┘                   │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Federated Learning: LoRA updates → Brain Update (10+ nodes)            │
│  Resource Monetization: compute_contributions → XAUt share              │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Cross-Platform Orchestration

| Платформа | Тип | Распределение | Пример |
|-----------|-----|---------------|--------|
| **Mobile** | JS (Worker) | Лёгкие задачи, inference-worker.js | Sentiment, классификация |
| **Desktop** | Node (Agent) | Средние задачи, pipeline layers | LoRA inference, части модели |
| **Server** | Go (Ollama) | Тяжёлые задачи, полный LLM | Chat completions, 7B+ |

### Логика распределения

- `prompt_len < 100` + `model=light` → Mobile
- `prompt_len < 500` + `model=medium` → Desktop (если есть)
- Иначе → Server (Ollama)

---

## 3. Public Interface — API Gateway

### GET /api/v1/infer

| Параметр | Тип | Описание |
|----------|-----|----------|
| `prompt` | string | Текст запроса (обязательно) |
| `model` | string | `light` \| `medium` \| `full` (default: full) |
| `stream` | bool | SSE streaming (default: false) |

**Ответ:**
```json
{
  "response": "...",
  "model": "qwen2.5-coder:7b",
  "platform": "server",
  "latency_ms": 1200,
  "contributors": ["node-1", "node-2"]
}
```

---

## 4. Heterogeneous Training (Federated Learning)

- Endpoints: `GET /api/v1/federated/active-model`, `POST /api/v1/federated/submit` (protected)
- Ноды отправляют LoRA updates после обработки задач
- Дифференциальная приватность (ε-DP)
- 10+ contributions → Brain Update
- Интеграция: после `mobile/complete` или pipeline layer completion нода может вызвать `/federated/submit`

---

## 5. Resource Monetization

### compute_contributions

Каждая нода записывает вклад:
- `node_id`, `wallet_address`, `platform` (mobile|desktop|server)
- `compute_units` (нормализованные единицы: FLOPs или token-seconds)
- `task_id`, `created_at`

### XAUt Share

- Доля = `compute_units_node / total_compute_units_epoch`
- Эпоха: 24h или 7d
- Распределение из Gold Reserve pool пропорционально доле

---

## 6. Интеграция

| Компонент | Роль |
|-----------|------|
| `UniversalMeshService` | Orchestration, routing |
| `GET /api/v1/infer` | Public API |
| `FederatedEngineService` | LoRA updates |
| `compute_contributions` | Таблица вкладов |
| `PoolMonitorService` | XAUt price для расчёта |
