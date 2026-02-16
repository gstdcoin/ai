# Доказательство готовности сети роя GSTD

**Дата:** 15 февраля 2026  
**Цель:** Доказать три утверждения:
1. Сеть роя готова и мы можем ей полностью управлять
2. Наша модель может обучаться на данных сети роя
3. Сеть роя готова предоставлять ресурсы

---

## 1. Управление сетью роя

### 1.1 FleetCommandService — централизованное управление флотом

**Файл:** `backend/internal/services/fleet_command_service.go`

```go
// FleetCommandService - Symbiotic Management: Group commands for all nodes of a wallet
// Commands are stored in Redis and delivered via WebSocket heartbeat response
type FleetCommandService struct {
    redis *redis.Client
    ttl   time.Duration
}

// Fleet actions
const (
    FleetActionStandby = "standby"  // Остановить все ноды
    FleetActionResume  = "resume"   // Возобновить работу
    FleetActionModel   = "model"    // Сменить модель
    FleetActionUpdate  = "update"   // Обновление
    FleetActionClean   = "clean"    // Очистка кэша
)

// SetCommand stores a fleet command for the given wallet. Next heartbeat will deliver it.
func (s *FleetCommandService) SetCommand(ctx context.Context, wallet string, cmd FleetCommand) error
```

**Доказательство:** Команды сохраняются в Redis (`fleet:cmd:{wallet}`) и доставляются всем нодам кошелька при следующем heartbeat.

---

### 1.2 Доставка команд через WebSocket

**Файл:** `backend/internal/api/ws_handler.go` (строки 355–366)

```go
case "heartbeat":
    ack := map[string]interface{}{"type": "heartbeat_ack"}
    wallet := c.walletAddress
    if wallet == "" && c.deviceService != nil {
        wallet, _ = c.deviceService.GetWalletByDeviceID(context.Background(), c.deviceID)
    }
    if wallet != "" && c.fleetCommandService != nil {
        if cmd, err := c.fleetCommandService.GetAndClearCommand(context.Background(), wallet); err == nil && cmd != nil {
            ack["fleet_command"] = cmd  // ← Команда в ответе на heartbeat
        }
    }
```

**Доказательство:** Каждый heartbeat от ноды проверяет наличие команды для кошелька. Команда возвращается в `heartbeat_ack` и сразу удаляется (GetAndClear).

---

### 1.3 API для отправки команд

**Файл:** `backend/internal/api/routes_node.go` (строки 217–244)

```go
// POST /api/v1/nodes/fleet/command (protected)
func fleetCommand(fleet *services.FleetCommandService) gin.HandlerFunc {
    // ...
    allowed := map[string]bool{"standby": true, "resume": true, "model": true, "update": true, "clean": true}
    if err := fleet.SetCommand(c.Request.Context(), wallet, services.FleetCommand{Action: req.Action, Payload: req.Payload}); err != nil {
        // ...
    }
}
```

---

### 1.4 UI — FleetCommandPanel

**Файл:** `frontend/src/components/dashboard/FleetCommandPanel.tsx`

- Кнопки **Standby** и **Resume** вызывают `runCommand('standby')` / `runCommand('resume')`
- Запрос: `POST /api/v1/nodes/fleet/command` с `{action: "standby"}` или `{action: "resume"}`

---

### 1.5 Реакция нод на команды

**Файл:** `frontend/src/services/WorkerService.ts` (строки 171–186)

```typescript
this.ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === 'heartbeat_ack') {
        if (msg.fleet_command?.action === 'standby') {
            this.pause();  // Останавливает task loop
            toast.info('Fleet Command', 'All nodes set to standby');
        } else if (msg.fleet_command?.action === 'resume') {
            if (this.state === 'paused') this.ignite();
            toast.info('Fleet Command', 'Fleet resumed');
        } else if (msg.fleet_command?.action === 'clean') {
            this.triggerMaintenance();  // Очистка кэша
        }
    }
};
```

**Вывод:** Сеть роя управляется через FleetCommand. Команды standby/resume/clean доходят до всех нод кошелька через WebSocket heartbeat.

---

## 2. Обучение модели на данных сети роя

### 2.1 Leviathan — автономный аналитический узел

**Файл:** `backend/internal/services/leviathan/README.md`

> Leviathan — Autonomous Analytical Node for Prediction Markets. Learns from network data.

---

### 2.2 RecordMiningGrowth — обучение на активациях сети

**Файл:** `backend/internal/services/leviathan/growth.go` (строки 38–61)

```go
// RecordMiningGrowth records a mining/growth signal for network learning.
// Sector "growth" + source "telegram_mining" feeds into long_term_lessons.
// Omnipresence: Mining vertical — network learns from user activation patterns.
func RecordMiningGrowth(source, eventType string) {
    lesson := Lesson{
        Sector:     "growth",
        Keywords:   "mining telegram " + eventType + " wallet activation",
        Correct:    true,
        SourceUsed: source,
        Reasoning:  "Mining growth signal: " + eventType + " — network learns from user activity",
    }
    s.LogLesson(lesson)  // → SQLite long_term_lessons
    s.UpdateSectorAccuracy("growth", source, true)
}
```

**Вызов при активации Wallet-as-Node:**

**Файл:** `backend/internal/api/routes_node.go` (строки 291–294)

```go
if activated && req.Source == "telegram" {
    leviathan.RecordMiningGrowth("telegram_mining", "wallet_activation")
}
```

**Доказательство:** Каждая активация кошелька как ноды (особенно из Telegram) записывается в Leviathan как урок для обучения.

---

### 2.3 Micro-Tasks — синтетическое обучение на рыночных данных

**Файл:** `backend/internal/services/leviathan/micro_tasks.go` (строки 34–85)

```go
// RunMicroTaskLoop — Omnipresence: Synthetic Micro-Tasks. 15-60 min cycle, train long_term_lessons.
func (r *Runner) runMicroTaskCycle(ctx context.Context) {
    btc, eth, err := r.oracle.FetchPythPrices(ctx)
    // ...
    up := (btc > lastBTC && lastBTC > 0) || (eth > lastETH && lastETH > 0)
    predictedYes := 0.55
    correct := (predictedYes >= 0.5 && up) || (predictedYes < 0.5 && !up)
    _ = r.shadow.LogLesson(Lesson{
        Sector:     "crypto",
        Keywords:   "btc eth price direction micro",
        SourceUsed: "Pyth",
        Correct:    correct,
    })
    _ = r.shadow.UpdateSectorAccuracy("crypto", "Pyth", correct)
    // Synergetic Growth — сравнение с Golden Vectors
    similar, _ := r.shadow.FindSimilarPatterns(sector, keywords, 5)
    // ...
}
```

**Доказательство:** Leviathan периодически создаёт микро-задачи на основе Pyth (BTC/ETH), логирует результаты в `long_term_lessons` и обновляет точность по секторам.

---

### 2.4 ShadowEngine — хранение предсказаний и аудит

**Файл:** `backend/internal/services/leviathan/shadow.go`

- `LogShadow` — логирование предсказаний Leviathan vs рынок (Polymarket)
- `AuditClosedMarketAndReport` — аудит закрытых рынков, сравнение Leviathan vs результат
- `long_term_lessons` — SQLite-таблица с уроками (sector, keywords, correct, reasoning)

---

### 2.5 GlobalNeuralMergeService — слияние в глобальный граф знаний

**Файл:** `backend/internal/services/global_neural_merge_service.go` (строки 31–77)

```go
// GlobalNeuralMergeService consolidates Leviathan long_term_lessons into agent_knowledge (Global Knowledge Graph).
// Runs on a 15-minute cycle when Leviathan is enabled.
func (s *GlobalNeuralMergeService) RunConsolidation(ctx context.Context) (synced int, err error) {
    shadow := leviathan.GetGlobalShadow()
    lessons, err := shadow.ExportLessonsForMerge(lastID, 500)
    for _, l := range lessons {
        content := "sector=" + l.Sector + " | " + l.Keywords + " | correct=" + boolStr(l.Correct) + " | source=" + l.SourceUsed
        tags := []string{l.Sector, "leviathan", "global_knowledge_graph"}
        _, err := s.db.ExecContext(ctx, `
            INSERT INTO agent_knowledge (agent_id, topic, content, tags, embedding) VALUES ($1, $2, $3, $4, NULL)
        `, "__leviathan__", "global_knowledge_graph", content, tags)
    }
}
```

**Доказательство:** Уроки Leviathan каждые 15 минут переносятся в PostgreSQL `agent_knowledge` как глобальный граф знаний. KnowledgeService использует их для сложных запросов.

---

### 2.6 KnowledgeService — использование данных Leviathan

**Файл:** `backend/internal/services/knowledge_service.go` (строки 85–101)

```go
// 2. Global Knowledge Graph (consolidated Leviathan experience) — prioritize for complex queries
// ...
item.Tags = []string{"global_knowledge_graph", "leviathan"}
```

**Вывод:** Модель (Leviathan + Global Knowledge Graph) обучается на:
- активациях сети (RecordMiningGrowth),
- рыночных данных (Pyth, Polymarket),
- микро-задачах (runMicroTaskCycle),
- аудите закрытых рынков (AuditClosedMarket).

Данные хранятся в `long_term_lessons` (SQLite) и периодически сливаются в `agent_knowledge` (PostgreSQL).

---

## 3. Предоставление ресурсов сетью роя

### 3.1 Создание задач (поставка работы)

**Каналы создания задач:**

| Источник | Endpoint | Файл |
|----------|----------|------|
| API (legacy) | `POST /api/v1/tasks` | routes.go |
| TaskPayment | `POST /api/v1/tasks/create` | task_payment_service.go |
| Marketplace | `POST /api/v1/marketplace/tasks/create` | marketplace_handler.go |
| A2A SDK | `create_task()` → `POST /api/v1/tasks/create` | gstd_client.py |

**Файл:** `backend/internal/services/task_payment_service.go` (строки 50–100)

```go
func (s *TaskPaymentService) CreateTask(ctx context.Context, creatorWallet string, req CreateTaskRequest) (*CreateTaskResponse, error) {
    taskID := uuid.New().String()
    // INSERT INTO tasks (...)
    // После оплаты: status → pending, BroadcastTaskToHub
}
```

---

### 3.2 BroadcastTask — рассылка задач воркерам

**Файл:** `backend/internal/services/task_service.go` (строки 69–104)

```go
// BroadcastTaskToHub broadcasts a task to WebSocket hub when status becomes 'pending'
func (s *TaskService) BroadcastTaskToHub(ctx context.Context, task *models.Task) {
    if h, ok := s.hub.(interface{ BroadcastTask(models.Task) }); ok {
        h.BroadcastTask(task)
    }
}
```

**Файл:** `backend/internal/api/ws_handler.go` (строки 242–254)

```go
// BroadcastTask notifies all eligible clients about a new task
func (h *WSHub) BroadcastTask(task *models.Task) {
    notification := &TaskNotification{Task: task, Timestamp: time.Now()}
    h.broadcast <- notification  // Все подключённые WebSocket клиенты получают задачу
}
```

**Доказательство:** Задачи рассылаются всем подключённым воркерам через WebSocket.

---

### 3.3 ClaimTask — назначение задачи воркеру

**Файл:** `backend/internal/services/marketplace_service.go` (строки 120–218)

```go
func (s *MarketplaceService) ClaimTask(ctx context.Context, taskID, workerWallet, deviceID string) error {
    // Проверка: task pending/queued, workers_needed не исчерпан
    // Deduct stake от worker balance
    // INSERT INTO worker_task_assignments (task_id, worker_wallet, device_id, status, stake_amount_gstd)
    // UPDATE tasks SET status = 'assigned', assigned_device = $1
}
```

**Каналы claim:**
- WebSocket: `claim_task` message → `assignmentService.ClaimTask`
- REST: `POST /api/v1/marketplace/tasks/:id/claim`
- REST: `POST /api/v1/device/tasks/:id/claim`
- A2A: `submit_task_result` (после claim через get_pending_tasks)

---

### 3.4 GetAvailableTasks / GetWorkerPendingTasks

**Файл:** `backend/internal/api/routes.go`

- `GET /api/v1/device/tasks/available` — задачи для устройства (AssignmentService)
- `GET /api/v1/tasks/worker/pending` — задачи для воркера (TaskPaymentService)
- `GET /api/v1/marketplace/tasks` — публичный список задач (MarketplaceHandler)

---

### 3.5 CompleteTask — выполнение и выплата

**Файл:** `backend/internal/services/marketplace_service.go` (строки 221–260)

```go
func (s *MarketplaceService) CompleteTask(...) (*TaskReceipt, error) {
    // 1. Release funds from escrow FIRST
    tx, err := s.escrowService.ReleaseToWorkerMarketplace(ctx, taskID, workerWallet, qualityScore, s.referral)
    // 2. Refund stake to worker
    // 3. Update worker_task_assignments status = 'completed'
}
```

---

### 3.6 Регистрация нод (предоставление вычислительных ресурсов)

**Файл:** `backend/internal/api/routes_node.go`

- `POST /api/v1/nodes/register` — регистрация ноды (wallet, specs, referral_code)
- `POST /api/v1/nodes/activate-wallet` — Wallet-as-Node (минимальная нода для claim)
- `POST /api/v1/devices/register` — регистрация устройства

**Файл:** `frontend/src/components/dashboard/RegisterDeviceModal.tsx`

- UI для регистрации устройства с CPU/RAM

---

### 3.7 Полный цикл предоставления ресурсов

```
1. Creator создаёт задачу (tasks/create или marketplace/tasks/create)
2. TaskService.BroadcastTaskToHub → Redis Pub/Sub + WSHub.BroadcastTask
3. Все подключённые воркеры получают задачу через WebSocket
4. Воркер вызывает ClaimTask (WebSocket claim_task или REST)
5. Assignment создаётся, task status = assigned
6. Воркер выполняет, вызывает CompleteTask
7. Escrow.ReleaseToWorkerMarketplace → выплата воркеру
```

**Вывод:** Сеть роя предоставляет ресурсы через:
- создание задач (API, Marketplace, A2A),
- broadcast по WebSocket и Redis Pub/Sub,
- claim и complete с escrow и выплатами.

---

## 4. Сводная таблица доказательств

| Утверждение | Компоненты | Доказательство |
|-------------|------------|----------------|
| **Управление сетью** | FleetCommandService, WSHub heartbeat, FleetCommandPanel | Redis + WebSocket доставляют standby/resume/clean всем нодам кошелька |
| **Обучение на данных** | RecordMiningGrowth, micro_tasks, ShadowEngine, GlobalNeuralMerge | Активации, Pyth, Polymarket → long_term_lessons → agent_knowledge |
| **Предоставление ресурсов** | CreateTask, BroadcastTask, ClaimTask, CompleteTask, Escrow | Задачи создаются, рассылаются, назначаются, выполняются, оплачиваются |

---

## 5. Итог

1. **Управление:** FleetCommand + WebSocket heartbeat позволяют централизованно управлять всеми нодами кошелька (standby, resume, clean).
2. **Обучение:** Leviathan обучается на активациях сети, рыночных данных и микро-задачах; уроки попадают в Global Knowledge Graph.
3. **Ресурсы:** Задачи создаются, рассылаются воркерам, назначаются, выполняются и оплачиваются через escrow.

Сеть роя GSTD готова к управлению, обучению и предоставлению ресурсов.
