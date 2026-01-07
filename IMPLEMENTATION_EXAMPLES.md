# Примеры реализации

## 1. Сервер: Task Queue Manager (Go)

```go
package main

import (
    "context"
    "database/sql"
    "encoding/json"
    "fmt"
    "time"
    
    _ "github.com/lib/pq"
)

type TaskQueueManager struct {
    db *sql.DB
    whitelistOps map[string]bool
    whitelistModels map[string]bool
}

type TaskDescriptor struct {
    TaskID          string    `json:"task_id"`
    TaskType        string    `json:"task_type"`
    Operation       string    `json:"operation"`
    Model           string    `json:"model"`
    Input           InputData `json:"input"`
    Constraints     Constraints `json:"constraints"`
    Reward          Reward    `json:"reward"`
    Validation      string    `json:"validation"`
}

type InputData struct {
    Source string `json:"source"`
    Hash   string `json:"hash"`
}

type Constraints struct {
    TimeLimitSec  int `json:"time_limit_sec"`
    MaxEnergyMwh  int `json:"max_energy_mwh"`
}

type Reward struct {
    AmountTon float64 `json:"amount_ton"`
}

func (tqm *TaskQueueManager) ValidateTask(task *TaskDescriptor) error {
    // Проверка whitelist операций
    if !tqm.whitelistOps[task.Operation] {
        return fmt.Errorf("operation %s not in whitelist", task.Operation)
    }
    
    // Проверка whitelist моделей
    if !tqm.whitelistModels[task.Model] {
        return fmt.Errorf("model %s not in whitelist", task.Model)
    }
    
    // Проверка лимитов
    if task.Constraints.TimeLimitSec < 1 || task.Constraints.TimeLimitSec > 5 {
        return fmt.Errorf("time_limit_sec must be between 1 and 5")
    }
    
    if task.Constraints.MaxEnergyMwh < 1 || task.Constraints.MaxEnergyMwh > 50 {
        return fmt.Errorf("max_energy_mwh must be between 1 and 50")
    }
    
    // Проверка типа задания
    validTypes := map[string]bool{
        "inference": true,
        "human": true,
        "validation": true,
        "agent": true,
    }
    if !validTypes[task.TaskType] {
        return fmt.Errorf("invalid task_type: %s", task.TaskType)
    }
    
    return nil
}

func (tqm *TaskQueueManager) CalculatePriorityScore(
    requesterAddress string,
    rewardAmount float64,
    taskUrgency float64,
) (float64, error) {
    // Получение данных заказчика
    var gstdStake float64
    var requesterRep float64
    
    err := tqm.db.QueryRow(`
        SELECT gstd_balance, reputation 
        FROM requesters 
        WHERE requester_address = $1
    `, requesterAddress).Scan(&gstdStake, &requesterRep)
    
    if err == sql.ErrNoRows {
        return 0, fmt.Errorf("requester not found")
    }
    if err != nil {
        return 0, err
    }
    
    // Нормализация значений (0-1)
    normalizedStake := normalizeStake(gstdStake)
    normalizedReward := normalizeReward(rewardAmount)
    normalizedRep := requesterRep // уже 0-1
    
    // Формула приоритизации
    priorityScore := (
        normalizedStake * 0.4 +
        normalizedReward * 0.3 +
        taskUrgency * 0.2 +
        normalizedRep * 0.1
    )
    
    return priorityScore, nil
}

func (tqm *TaskQueueManager) CreateTask(
    ctx context.Context,
    requesterAddress string,
    taskDescriptor *TaskDescriptor,
) error {
    // Валидация
    if err := tqm.ValidateTask(taskDescriptor); err != nil {
        return err
    }
    
    // Проверка escrow баланса
    var escrowBalance float64
    err := tqm.db.QueryRow(`
        SELECT escrow_amount_ton 
        FROM tasks 
        WHERE requester_address = $1 
        AND status = 'pending'
        ORDER BY created_at DESC
        LIMIT 1
    `, requesterAddress).Scan(&escrowBalance)
    
    if err != nil && err != sql.ErrNoRows {
        return err
    }
    
    if escrowBalance < taskDescriptor.Reward.AmountTon {
        return fmt.Errorf("insufficient escrow balance")
    }
    
    // Расчёт приоритета
    taskUrgency := calculateUrgency(time.Now(), time.Now().Add(5*time.Minute))
    priorityScore, err := tqm.CalculatePriorityScore(
        requesterAddress,
        taskDescriptor.Reward.AmountTon,
        taskUrgency,
    )
    if err != nil {
        return err
    }
    
    // Сохранение в БД
    taskJSON, _ := json.Marshal(taskDescriptor)
    
    _, err = tqm.db.ExecContext(ctx, `
        INSERT INTO tasks (
            task_id, requester_address, task_type, operation, model,
            input_source, input_hash, constraints_time_limit_sec,
            constraints_max_energy_mwh, reward_amount_ton, validation_method,
            priority_score, status, created_at, escrow_address, escrow_amount_ton
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
    `,
        taskDescriptor.TaskID,
        requesterAddress,
        taskDescriptor.TaskType,
        taskDescriptor.Operation,
        taskDescriptor.Model,
        taskDescriptor.Input.Source,
        taskDescriptor.Input.Hash,
        taskDescriptor.Constraints.TimeLimitSec,
        taskDescriptor.Constraints.MaxEnergyMwh,
        taskDescriptor.Reward.AmountTon,
        taskDescriptor.Validation,
        priorityScore,
        "pending",
        time.Now(),
        "", // escrow_address из контракта
        taskDescriptor.Reward.AmountTon,
    )
    
    if err != nil {
        return err
    }
    
    // Добавление в очередь
    _, err = tqm.db.ExecContext(ctx, `
        INSERT INTO task_queue (task_id, priority_score, queued_at, status)
        VALUES ($1, $2, $3, 'queued')
    `, taskDescriptor.TaskID, priorityScore, time.Now())
    
    return err
}

func normalizeStake(stake float64) float64 {
    maxStake := 1000000.0 // 1M GSTD
    if stake > maxStake {
        return 1.0
    }
    return stake / maxStake
}

func normalizeReward(reward float64) float64 {
    maxReward := 1.0 // 1 TON
    if reward > maxReward {
        return 1.0
    }
    return reward / maxReward
}

func calculateUrgency(now, deadline time.Time) float64 {
    duration := deadline.Sub(now)
    if duration <= 0 {
        return 1.0
    }
    if duration >= 24*time.Hour {
        return 0.0
    }
    return 1.0 - (duration.Hours() / 24.0)
}
```

## 2. Сервер: Device Matcher (Go)

```go
type DeviceMatcher struct {
    db *sql.DB
}

type Device struct {
    DeviceID        string
    WalletAddress   string
    Reputation      float64
    AvailableEnergy int
    NetworkLatency  int
    CachedModels    []string
    CurrentLoad     int
}

func (dm *DeviceMatcher) SelectDevice(
    ctx context.Context,
    taskID string,
    requiredModel string,
) (*Device, error) {
    // Получение списка доступных устройств
    rows, err := dm.db.QueryContext(ctx, `
        SELECT 
            device_id, wallet_address, reputation,
            cached_models, last_seen_at
        FROM devices
        WHERE is_active = true
        AND last_seen_at > NOW() - INTERVAL '5 minutes'
        ORDER BY reputation DESC
        LIMIT 100
    `)
    if err != nil {
        return nil, err
    }
    defer rows.Close()
    
    var bestDevice *Device
    var bestScore float64 = -1
    
    for rows.Next() {
        var device Device
        var cachedModelsJSON string
        var lastSeen time.Time
        
        err := rows.Scan(
            &device.DeviceID,
            &device.WalletAddress,
            &device.Reputation,
            &cachedModelsJSON,
            &lastSeen,
        )
        if err != nil {
            continue
        }
        
        // Парсинг кэшированных моделей
        json.Unmarshal([]byte(cachedModelsJSON), &device.CachedModels)
        
        // Проверка наличия модели в кэше
        hasModel := false
        for _, model := range device.CachedModels {
            if model == requiredModel {
                hasModel = true
                break
            }
        }
        
        // Расчёт network latency (упрощённо)
        device.NetworkLatency = 50 // мс
        
        // Расчёт доступной энергии (упрощённо)
        device.AvailableEnergy = 100 // mwh
        
        // Расчёт текущей нагрузки (упрощённо)
        var activeTasks int
        dm.db.QueryRow(`
            SELECT COUNT(*) 
            FROM task_assignments 
            WHERE device_id = $1 
            AND status IN ('assigned', 'executing')
        `, device.DeviceID).Scan(&activeTasks)
        device.CurrentLoad = activeTasks
        
        // Расчёт score
        score := dm.calculateDeviceScore(&device, requiredModel, hasModel)
        
        if score > bestScore {
            bestScore = score
            bestDevice = &device
        }
    }
    
    if bestDevice == nil {
        return nil, fmt.Errorf("no available devices")
    }
    
    return bestDevice, nil
}

func (dm *DeviceMatcher) calculateDeviceScore(
    device *Device,
    requiredModel string,
    hasCachedModel bool,
) float64 {
    repWeight := 0.4
    energyWeight := 0.2
    latencyWeight := 0.1
    cacheWeight := 0.2
    loadPenalty := 0.1
    
    // Нормализация энергии (0-1)
    normalizedEnergy := float64(device.AvailableEnergy) / 100.0
    
    // Нормализация latency (чем меньше - тем лучше)
    normalizedLatency := 1.0 - (float64(device.NetworkLatency) / 500.0)
    if normalizedLatency < 0 {
        normalizedLatency = 0
    }
    
    // Бонус за кэш
    cacheBonus := 0.0
    if hasCachedModel {
        cacheBonus = 1.0
    }
    
    // Штраф за нагрузку
    loadPenaltyValue := float64(device.CurrentLoad) * 0.1
    if loadPenaltyValue > 1.0 {
        loadPenaltyValue = 1.0
    }
    
    score := (
        device.Reputation * repWeight +
        normalizedEnergy * energyWeight +
        normalizedLatency * latencyWeight +
        cacheBonus * cacheWeight -
        loadPenaltyValue * loadPenalty
    )
    
    return score
}
```

## 3. Сервер: Result Validator (Go)

```go
type ResultValidator struct {
    db *sql.DB
    aiValidator *AIValidator
}

type ValidationResult struct {
    Status    string
    Method    string
    Confidence float64
}

func (rv *ResultValidator) Validate(
    ctx context.Context,
    taskID string,
    assignmentID string,
    result interface{},
) (*ValidationResult, error) {
    // Получение задания
    var task TaskDescriptor
    var validationMethod string
    
    err := rv.db.QueryRow(`
        SELECT validation_method, task_type, operation
        FROM tasks
        WHERE task_id = $1
    `, taskID).Scan(&validationMethod, &task.TaskType, &task.Operation)
    if err != nil {
        return nil, err
    }
    
    // Выбор метода валидации
    switch validationMethod {
    case "reference":
        return rv.validateReference(ctx, taskID, result)
    case "majority":
        return rv.validateMajority(ctx, taskID, assignmentID, result)
    case "ai_check":
        return rv.validateAI(ctx, taskID, result)
    case "human":
        return rv.validateHuman(ctx, taskID, assignmentID)
    default:
        return nil, fmt.Errorf("unknown validation method: %s", validationMethod)
    }
}

func (rv *ResultValidator) validateReference(
    ctx context.Context,
    taskID string,
    result interface{},
) (*ValidationResult, error) {
    // Получение эталонного результата
    var referenceResult interface{}
    err := rv.db.QueryRow(`
        SELECT reference_result
        FROM validations
        WHERE task_id = $1
        AND validation_method = 'reference'
    `, taskID).Scan(&referenceResult)
    
    if err == sql.ErrNoRows {
        // Первый результат становится эталоном
        _, err = rv.db.Exec(`
            INSERT INTO validations (task_id, validation_method, reference_result, validation_result)
            VALUES ($1, 'reference', $2, 'pending')
        `, taskID, result)
        return &ValidationResult{
            Status: "pending",
            Method: "reference",
        }, err
    }
    
    // Сравнение с эталоном
    if compareResults(result, referenceResult) {
        return &ValidationResult{
            Status: "passed",
            Method: "reference",
            Confidence: 1.0,
        }, nil
    }
    
    return &ValidationResult{
        Status: "failed",
        Method: "reference",
        Confidence: 0.0,
    }, nil
}

func (rv *ResultValidator) validateMajority(
    ctx context.Context,
    taskID string,
    assignmentID string,
    result interface{},
) (*ValidationResult, error) {
    // Получение всех результатов для этого задания
    rows, err := rv.db.Query(`
        SELECT result_data
        FROM task_assignments
        WHERE task_id = $1
        AND status = 'completed'
    `, taskID)
    if err != nil {
        return nil, err
    }
    defer rows.Close()
    
    var results []interface{}
    for rows.Next() {
        var res interface{}
        rows.Scan(&res)
        results = append(results, res)
    }
    
    // Добавление текущего результата
    results = append(results, result)
    
    // Подсчёт совпадений
    matches := 0
    for i := 0; i < len(results); i++ {
        for j := i + 1; j < len(results); j++ {
            if compareResults(results[i], results[j]) {
                matches++
            }
        }
    }
    
    // Консенсус: ≥66% совпадений
    totalComparisons := len(results) * (len(results) - 1) / 2
    consensusRate := float64(matches) / float64(totalComparisons)
    
    if consensusRate >= 0.66 {
        return &ValidationResult{
            Status: "passed",
            Method: "majority",
            Confidence: consensusRate,
        }, nil
    }
    
    // Если недостаточно результатов, ждём ещё
    if len(results) < 3 {
        return &ValidationResult{
            Status: "pending",
            Method: "majority",
        }, nil
    }
    
    return &ValidationResult{
        Status: "failed",
        Method: "majority",
        Confidence: consensusRate,
    }, nil
}

func (rv *ResultValidator) validateAI(
    ctx context.Context,
    taskID string,
    result interface{},
) (*ValidationResult, error) {
    // Использование AI для проверки
    confidence, err := rv.aiValidator.Validate(taskID, result)
    if err != nil {
        return nil, err
    }
    
    if confidence >= 0.95 {
        return &ValidationResult{
            Status: "passed",
            Method: "ai_check",
            Confidence: confidence,
        }, nil
    }
    
    return &ValidationResult{
        Status: "failed",
        Method: "ai_check",
        Confidence: confidence,
    }, nil
}

func (rv *ResultValidator) validateHuman(
    ctx context.Context,
    taskID string,
    assignmentID string,
) (*ValidationResult, error) {
    // Ожидание человеческой валидации
    return &ValidationResult{
        Status: "pending",
        Method: "human",
    }, nil
}

func compareResults(a, b interface{}) bool {
    // Упрощённое сравнение
    // В реальной реализации используется глубокое сравнение
    return a == b
}
```

## 4. Клиент: Мобильное приложение (Kotlin)

```kotlin
class TaskExecutor(private val apiClient: ApiClient) {
    
    suspend fun executeTask(task: TaskDescriptor): TaskResult {
        // Загрузка данных
        val inputData = loadInputData(task.input)
        
        // Загрузка модели
        val model = loadModel(task.model)
        
        // Выполнение операции
        val result = when (task.operation) {
            "classify_text" -> classifyText(model, inputData)
            "detect_objects" -> detectObjects(model, inputData)
            else -> throw IllegalArgumentException("Unknown operation")
        }
        
        // Формирование proof
        val proof = createProof(task, result)
        
        return TaskResult(
            taskId = task.taskId,
            result = result,
            proof = proof
        )
    }
    
    private suspend fun loadInputData(input: InputData): ByteArray {
        return when (input.source) {
            "ipfs" -> loadFromIPFS(input.hash)
            "http" -> loadFromHTTP(input.hash)
            "inline" -> input.hash.toByteArray()
            else -> throw IllegalArgumentException("Unknown source")
        }
    }
    
    private suspend fun loadModel(modelName: String): Model {
        // Проверка кэша
        val cachedModel = modelCache.get(modelName)
        if (cachedModel != null) {
            return cachedModel
        }
        
        // Загрузка модели
        val model = downloadModel(modelName)
        
        // Сохранение в кэш
        modelCache.put(modelName, model)
        
        return model
    }
    
    private fun classifyText(model: Model, data: ByteArray): ClassificationResult {
        val startTime = System.currentTimeMillis()
        val startEnergy = getCurrentEnergy()
        
        // Выполнение классификации
        val result = model.classify(data)
        
        val endTime = System.currentTimeMillis()
        val endEnergy = getCurrentEnergy()
        
        return ClassificationResult(
            classification = result,
            executionTimeMs = (endTime - startTime).toInt(),
            energyConsumedMwh = (endEnergy - startEnergy).toInt()
        )
    }
    
    private fun createProof(
        task: TaskDescriptor,
        result: Any
    ): ProofOfExecution {
        val wallet = WalletManager.getWallet()
        val timestamp = System.currentTimeMillis() / 1000
        
        val message = buildString {
            append(task.taskId)
            append(timestamp)
            append(result.hashCode())
        }
        
        val signature = wallet.sign(message)
        
        return ProofOfExecution(
            deviceId = DeviceFingerprint.get(),
            timestamp = timestamp,
            signature = signature,
            energyConsumed = (result as? ClassificationResult)?.energyConsumedMwh ?: 0,
            executionTimeMs = (result as? ClassificationResult)?.executionTimeMs ?: 0
        )
    }
}

data class TaskResult(
    val taskId: String,
    val result: Any,
    val proof: ProofOfExecution
)

data class ProofOfExecution(
    val deviceId: String,
    val timestamp: Long,
    val signature: String,
    val energyConsumed: Int,
    val executionTimeMs: Int
)
```

## 5. Клиент: Интеграция с TON

```kotlin
class TONPaymentHandler(private val tonClient: TONClient) {
    
    suspend fun waitForPayment(taskId: String, deviceAddress: String): PaymentStatus {
        // Подписка на события контракта
        val contract = tonClient.getContract(CONTRACT_ADDRESS)
        
        // Ожидание события выплаты
        return contract.waitForEvent<PaymentEvent> { event ->
            event.taskId == taskId && event.deviceAddress == deviceAddress
        }
    }
    
    suspend fun checkPaymentStatus(txHash: String): PaymentStatus {
        val transaction = tonClient.getTransaction(txHash)
        
        return when {
            transaction == null -> PaymentStatus.PENDING
            transaction.status == "confirmed" -> PaymentStatus.COMPLETED
            transaction.status == "failed" -> PaymentStatus.FAILED
            else -> PaymentStatus.PENDING
        }
    }
}

enum class PaymentStatus {
    PENDING,
    COMPLETED,
    FAILED
}
```

## 6. Конфигурация whitelist

```json
{
  "operations": {
    "classify_text": {
      "description": "Классификация текста",
      "supported_models": ["light-nlp-v1", "light-nlp-v2"],
      "average_time_ms": 2000,
      "average_energy_mwh": 5,
      "max_time_ms": 5000,
      "max_energy_mwh": 10
    },
    "detect_objects": {
      "description": "Детекция объектов",
      "supported_models": ["light-cv-v1"],
      "average_time_ms": 3000,
      "average_energy_mwh": 8,
      "max_time_ms": 5000,
      "max_energy_mwh": 15
    },
    "sentiment_analysis": {
      "description": "Анализ тональности",
      "supported_models": ["light-nlp-v1"],
      "average_time_ms": 1500,
      "average_energy_mwh": 3,
      "max_time_ms": 5000,
      "max_energy_mwh": 8
    }
  },
  "models": {
    "light-nlp-v1": {
      "size_mb": 10,
      "operations": ["classify_text", "sentiment_analysis"],
      "ipfs_hash": "QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco",
      "framework": "tensorflow_lite"
    },
    "light-cv-v1": {
      "size_mb": 15,
      "operations": ["detect_objects"],
      "ipfs_hash": "QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG",
      "framework": "tensorflow_lite"
    }
  }
}
```

