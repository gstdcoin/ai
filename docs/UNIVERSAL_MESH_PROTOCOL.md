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

## 6. Knowledge Cross-Link (UniversalMesh_Routing)

При поглощении новой модели субагент **Knowledge_Integrator** сравнивает её возможности с текущими лидерами и обновляет таблицу `universal_mesh_routing`:

| Поле | Описание |
|------|----------|
| `model_id` | Нормализованный ID модели |
| `platform_preference` | mobile \| desktop \| server |
| `capability_score` | Комбинация block count + HF popularity |
| `rank` | Порядок среди лидеров |

Логика: light (≤2 blocks) → mobile, medium (≤6 blocks) → desktop, иначе → server.

---

## 7. Predictive Mirroring (Leviathan + HF Trending)

При `LEVIATHAN_ENABLED=true`:
- Leviathan анализирует раздел **Trending** на Hugging Face (`sort=likes7d`)
- Топ-3 модели дня автоматически шардируются до запроса пользователей
- Цикл: каждые 6 часов

---

## 8. Bandwidth Throttling

Скорость загрузки из внешних источников (HF API) ограничена до **30% канала сервера**, чтобы не мешать основному инференсу. Внутренние передачи между нодами не ограничены.

- Env: `EXTERNAL_BANDWIDTH_MBPS` — абсолютный лимит в Mbps (default: 30)

---

## 9. Supreme Coordinator Protocol

| Компонент | Описание |
|-----------|----------|
| **Performance-Based Pruning** | Модели из Predictive Mirroring без запросов 48h → rank+100, platform→server (освобождение mobile шардов) |
| **Golden Incentive Alignment** | Модели с max capability_score в категории → +10% compute_units воркерам |
| **Integrity Cross-Check** | Каждое LoRA-обновление проверяется: model_name должен быть в universal_mesh_routing или federated_model_targets |

---

## 10. Profit Maximization (Leviathan)

Сопоставление inferenceFeeGSTD с затратами на энергию/трафик в регионах (Node_Metadata, region_cost_defaults). Клиентам предлагаются ноды с максимальной маржой для Golden Treasury.

- `node_metadata`: node_id, region, energy_cost_per_kwh, traffic_cost_per_gb
- `LeviathanProfitService.GetNodesByMargin`: сортировка нод по margin = fee - cost

---

## 11. Automated Talent Hunting

Если по категории (biomedical_research, code, text_generation и т.д.) нет модели с capability_score > 7.0 — внеочередной поиск на HF. Цикл: 12 часов.

---

## 12. Decentralized Governance (Mesh Constitution)

Раз в месяц формируется отчёт:
- Доминирующие модели (rank, capability_score)
- Изменение золотого резерва (golden_reserve_log)
- API: `GET /api/v1/mesh/constitution`

---

## 13. Singularity Ready (Final Status)

| Компонент | Описание |
|-----------|----------|
| **Global Equilibrium** | Баланс "жадности" (Profit) и "обучения" (Talent). Если резерв растёт быстрее плана (5%/мес) → больше хэшрейта на поиск моделей |
| **Immortal Identity** | Каждая Конституция Меша — SHA256 hash, сохранение в blockchain (TON/Solana) как неизменяемая летопись |
| **Archon Protocol** | При падении avg capability_score < 5.0: полный сброс роутинга + принудительное зеркалирование топ-10 моделей мира |

---

## 14. Интеграция

| Компонент | Роль |
|-----------|------|
| `UniversalMeshService` | Orchestration, routing |
| `SupremeCoordinatorService` | Pruning, Golden Incentive, Integrity Cross-Check |
| `LeviathanProfitService` | Profit Maximization: node routing by margin |
| `TalentHuntingService` | Category gap → HF search |
| `MeshConstitutionService` | Monthly governance report |
| `ConstitutionAnchorService` | Immortal Identity: hash → blockchain |
| `SingularityReadyService` | Global Equilibrium, Archon Protocol |
| `universal_mesh_routing` | model → platform, source, category, last_request_at |
| `KnowledgeIntegrator` | Обновление routing при поглощении |
| `PredictiveMirroringService` | HF Trending → top-3 sharding (source=predictive) |
| `GET /api/v1/infer` | Public API |
| `GET /api/v1/mesh/constitution` | Mesh Constitution report |
| `FederatedEngineService` | LoRA updates + Integrity Cross-Check |
| `compute_contributions` | Таблица вкладов |
| `PoolMonitorService` | XAUt price для расчёта |
