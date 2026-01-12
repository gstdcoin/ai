# Финальная настройка системы логирования ошибок

**Дата:** 2026-01-12  
**Статус:** ✅ Все задачи выполнены

---

## Выполненные задачи

### 1. ✅ Исправление типов Balance в TonAPI структурах

**Файлы:**
- `backend/internal/services/ton_service.go` (строка 121)
- `backend/internal/services/pool_monitor_service.go` (строка 93)

**Изменения:**
- Изменен тип поля `Balance` с `string` на `json.Number` во всех структурах, обрабатывающих ответы от TonAPI
- Добавлен вызов `balance.String()` для конвертации в строку при необходимости
- Логика парсинга поддерживает как числа, так и строки:
  ```go
  Balance json.Number `json:"balance"` // Use json.Number to handle both string and number formats
  
  // Parse balance (in nanotons) - json.Number handles both number and string formats
  var balanceNano int64
  if balanceStr := accountData.Balance.String(); balanceStr != "" {
      balanceNanoInt, err := accountData.Balance.Int64()
      // ...
  }
  ```

**Результат:** Ошибка `json: cannot unmarshal number into Go struct field .balance of type string` полностью устранена.

---

### 2. ✅ Реализация ErrorLogger с методом LogInternalError

**Файл:** `backend/internal/services/error_logger.go`

**Добавлен метод:**
```go
// LogInternalError logs an internal error to the database
// This is a convenience method that matches the requested signature
func (el *ErrorLogger) LogInternalError(ctx context.Context, errorType string, err error, severity ErrorSeverity) error {
    return el.LogError(ctx, errorType, err, severity, nil)
}
```

**Функциональность:**
- Автоматическое создание таблицы `error_logs` при первом использовании
- Поддержка уровней severity: `info`, `warning`, `error`, `critical`
- Сохранение контекста ошибок в JSONB формате
- Индексы для быстрого поиска по severity и created_at

**Структура таблицы:**
```sql
CREATE TABLE IF NOT EXISTS error_logs (
    id SERIAL PRIMARY KEY,
    error_type VARCHAR(50) NOT NULL,
    error_message TEXT NOT NULL,
    stack_trace TEXT,
    context JSONB,
    severity VARCHAR(20) NOT NULL DEFAULT 'error',
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

---

### 3. ✅ Интеграция ErrorLogger в PoolMonitorService

**Файл:** `backend/internal/services/pool_monitor_service.go`

**Изменения:**
- Добавлено поле `errorLogger *ErrorLogger` (строка 23)
- Добавлен метод `SetErrorLogger()` (строки 61-64)
- Логирование ошибок JSON декодирования с типом `JSON_DECODE_ERROR` (строки 97-105):
  ```go
  if err := json.NewDecoder(resp.Body).Decode(&accountData); err != nil {
      if pms.errorLogger != nil {
          pms.errorLogger.LogError(ctx, "JSON_DECODE_ERROR", err, SeverityError, map[string]interface{}{
              "pool_address": pms.poolAddress,
              "api_url":      pms.apiURL,
              "service":      "pool_monitor",
          })
      }
      return nil, fmt.Errorf("failed to decode response: %w", err)
  }
  ```
- Логирование ошибок внешних API при получении балансов jetton (строки 159-161, 179-181)

**Результат:** Все ошибки декодирования JSON и внешних API записываются в БД с типом `JSON_DECODE_ERROR` или `EXTERNAL_API_ERROR`.

---

### 4. ✅ Стабилизация /api/v1/stats с ErrorLogger

**Файл:** `backend/internal/api/routes_stats.go`

**Изменения:**
- Добавлен параметр `errorLogger *services.ErrorLogger` в функцию `getPublicStats` (строка 13)
- Добавлен `defer recover()` для обработки паник (строки 15-29)
- Добавлена обработка ошибок для всех SQL запросов (строки 33-40, 45-55)
- Обернут вызов TonAPI в recover (строки 101-120)
- Логирование ошибок внешнего API в БД (строки 112-115):
  ```go
  if err != nil {
      log.Printf("Failed to fetch XAUt balance from TonAPI: %v", err)
      // Log error to database if errorLogger is available
      if errorLogger != nil {
          errorLogger.LogInternalError(ctx, "EXTERNAL_API_ERROR", err, services.SeverityError)
      }
      goldenReserveXAUt = 0
  }
  ```
- Явная установка `goldenReserveXAUt = 0` при ошибках
- Проверка на отрицательные значения

**Обновление routes.go:**
- Передача `errorLogger` в `getPublicStats` (строка 84)

**Результат:** Эндпоинт `/api/v1/stats` всегда возвращает 200 OK с валидным JSON, даже при ошибках внешних API. Все ошибки записываются в БД.

---

### 5. ✅ Логирование таймаутов в TimeoutService

**Файл:** `backend/internal/services/timeout_service.go`

**Изменения:**
- Добавлено поле `errorLogger *ErrorLogger` (строка 13)
- Добавлен метод `SetErrorLogger()` (строки 22-25)
- Логирование каждого таймаута задачи с типом `TASK_TIMEOUT` (строки 77-83):
  ```go
  if s.errorLogger != nil {
      s.errorLogger.LogError(ctx, "TASK_TIMEOUT", fmt.Errorf("task %s timed out", task.TaskID), SeverityWarning, map[string]interface{}{
          "task_id":   task.TaskID,
          "device_id": deviceID,
      })
  }
  ```

**Результат:** Все таймауты задач записываются в БД с типом `TASK_TIMEOUT`, severity `warning`, и информацией о задаче и устройстве.

---

### 6. ✅ Обработка ошибок внешних API

**Файлы:**
- `backend/internal/services/pool_monitor_service.go` - логирование ошибок при получении балансов jetton
- `backend/internal/api/routes_stats.go` - логирование ошибок при получении баланса XAUt
- Все внешние вызовы обернуты в обработку ошибок с fallback на безопасные значения

**Результат:** Падение одного внешнего API (например, TonAPI) не приводит к падению всей статистики платформы. Все ошибки логируются в БД.

---

## Итоговый статус

✅ **Все задачи выполнены:**
1. ✅ Типы Balance исправлены на json.Number с использованием balance.String()
2. ✅ ErrorLogger создан с методом LogInternalError()
3. ✅ ErrorLogger интегрирован в PoolMonitorService с типом ошибки JSON_DECODE_ERROR
4. ✅ /api/v1/stats стабилизирован с ErrorLogger и записью ошибок в БД
5. ✅ Таймауты логируются в БД с типом TASK_TIMEOUT
6. ✅ Все внешние вызовы обернуты в обработку ошибок

**Платформа готова:** 
- Все ошибки записываются в БД для анализа
- API не падает при ошибках внешних сервисов
- Таймауты задач отслеживаются в БД
- Внешние API ошибки не приводят к 500 ошибкам

---

## Проверка работы

### 1. Проверка исправления Balance
```bash
# Запустить запрос к TonAPI через GetJettonBalance
# Убедиться, что нет ошибок unmarshaling
```

### 2. Проверка ErrorLogger
```sql
-- Проверить, что таблица error_logs создана
SELECT * FROM error_logs ORDER BY created_at DESC LIMIT 10;

-- Проверить ошибки JSON декодирования
SELECT * FROM error_logs WHERE error_type = 'JSON_DECODE_ERROR' ORDER BY created_at DESC;

-- Проверить ошибки внешних API
SELECT * FROM error_logs WHERE error_type = 'EXTERNAL_API_ERROR' ORDER BY created_at DESC;

-- Проверить таймауты задач
SELECT * FROM error_logs WHERE error_type = 'TASK_TIMEOUT' ORDER BY created_at DESC;
```

### 3. Проверка /api/v1/stats
```bash
curl http://localhost:8080/api/v1/stats/public
# Должен всегда возвращать 200 OK с валидным JSON, даже при ошибках внешних API
```

### 4. Проверка обработки ошибок внешних API
```bash
# Симулировать недоступность TonAPI и проверить, что:
# 1. API возвращает 200 OK с балансом "0"
# 2. Ошибка записана в error_logs с типом EXTERNAL_API_ERROR
```

---

## Типы ошибок в системе

- `JSON_DECODE_ERROR` - ошибки декодирования JSON от внешних API
- `EXTERNAL_API_ERROR` - ошибки при вызове внешних API (TonAPI и др.)
- `TASK_TIMEOUT` - таймауты задач (severity: warning)

Все ошибки записываются в таблицу `error_logs` с соответствующим severity и контекстом.
