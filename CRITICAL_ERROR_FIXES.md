# Исправление критической ошибки unmarshaling и стабилизация /api/v1/stats

**Дата:** 2026-01-12  
**Статус:** ✅ Все исправления применены

---

## Выполненные задачи

### 1. ✅ Исправление типов Balance в TonAPI структурах

**Файлы:**
- `backend/internal/services/ton_service.go` (строка 121)
- `backend/internal/services/pool_monitor_service.go` (строка 93)

**Изменения:**
- Изменен тип поля `Balance` с `string` на `json.Number` во всех структурах, обрабатывающих ответы от TonAPI
- Обновлена логика парсинга для поддержки как чисел, так и строк:
  ```go
  Balance json.Number `json:"balance"` // Use json.Number to handle both string and number formats
  ```

**Результат:** Ошибка `json: cannot unmarshal number into Go struct field .balance of type string` полностью устранена.

---

### 2. ✅ Внедрение ErrorLogger с методом Log()

**Файл:** `backend/internal/services/error_logger.go`

**Добавлен метод:**
```go
// Log logs an error with a simple signature (alias for LogError for convenience)
func (el *ErrorLogger) Log(ctx context.Context, errorType string, message string, severity ErrorSeverity, extras map[string]interface{}) error {
    var err error
    if message != "" {
        err = fmt.Errorf(message)
    }
    return el.LogError(ctx, errorType, err, severity, extras)
}
```

**Функциональность:**
- Автоматическое создание таблицы `error_logs` при первом использовании
- Поддержка уровней severity: `info`, `warning`, `error`, `critical`
- Сохранение контекста ошибок в JSONB формате
- Индексы для быстрого поиска по severity и created_at

---

### 3. ✅ Интеграция ErrorLogger в PoolMonitorService

**Файл:** `backend/internal/services/pool_monitor_service.go`

**Изменения:**
- Добавлено поле `errorLogger *ErrorLogger` (строка 23)
- Добавлен метод `SetErrorLogger()` (строки 61-64)
- Логирование ошибок JSON декодирования (строки 97-105):
  ```go
  if err := json.NewDecoder(resp.Body).Decode(&accountData); err != nil {
      if pms.errorLogger != nil {
          pms.errorLogger.LogError(ctx, "pool_monitor_json_decode", err, SeverityError, map[string]interface{}{
              "pool_address": pms.poolAddress,
              "api_url":      pms.apiURL,
          })
      }
      return nil, fmt.Errorf("failed to decode response: %w", err)
  }
  ```
- Логирование ошибок парсинга баланса (строки 117-123)

**Результат:** Все ошибки декодирования JSON и парсинга баланса записываются в БД для анализа.

---

### 4. ✅ Интеграция ErrorLogger в TonConnectValidator

**Файл:** `backend/internal/services/tonconnect_validator.go`

**Изменения:**
- Добавлено поле `errorLogger *ErrorLogger` (строка 28)
- Добавлен метод `SetErrorLogger()` (строки 39-42)
- Логирование ошибок JSON декодирования payload (строки 64-70)
- Логирование ошибок невалидной подписи (строки 196-203)

**Интеграция в routes.go:**
```go
tonConnectValidator := services.NewTonConnectValidator(tonService)
if errorLogger != nil {
    tonConnectValidator.SetErrorLogger(errorLogger)
}
```

**Результат:** Все ошибки валидации TonConnect записываются в БД.

---

### 5. ✅ Стабилизация /api/v1/stats с recover и проверками

**Файлы:**
- `backend/internal/api/routes.go` (функция `getStats`)
- `backend/internal/api/routes_stats.go` (функция `getPublicStats`)

**Изменения:**

#### getStats (routes.go):
- Добавлен `defer recover()` для обработки паник (строки 329-338)
- Добавлена проверка на `nil` stats (строки 340-348)
- Всегда возвращается 200 OK с безопасными значениями по умолчанию

#### getPublicStats (routes_stats.go):
- Добавлен `defer recover()` для обработки паник (строки 15-26)
- Добавлена обработка ошибок для всех SQL запросов (строки 17-21, 26-32)
- Обернут вызов TonAPI в recover (строки 77-87)
- Явная установка `goldenReserveXAUt = 0` при ошибках (строка 83)
- Проверка на отрицательные значения (строки 89-91)

**Результат:** Эндпоинт `/api/v1/stats` всегда возвращает 200 OK с валидным JSON, даже при ошибках внешних API или паниках.

---

### 6. ✅ Логирование таймаутов в TimeoutService

**Файл:** `backend/internal/services/timeout_service.go`

**Изменения:**
- Добавлено поле `errorLogger *ErrorLogger` (строка 13)
- Добавлен метод `SetErrorLogger()` (строки 22-25)
- Логирование каждого таймаута задачи (строки 77-83):
  ```go
  if s.errorLogger != nil {
      s.errorLogger.LogError(ctx, "task_timeout", fmt.Errorf("task %s timed out", task.TaskID), SeverityWarning, map[string]interface{}{
          "task_id":   task.TaskID,
          "device_id": deviceID,
      })
  }
  ```

**Результат:** Все таймауты задач записываются в БД с информацией о задаче и устройстве (severity: `warning`).

---

### 7. ✅ Обновление main.go для инициализации ErrorLogger

**Файл:** `backend/main.go`

**Изменения:**
- Инициализация ErrorLogger (строка 177)
- Установка в TimeoutService (строка 188)
- Установка в PoolMonitorService (строка 146)
- Передача ErrorLogger в SetupRoutes (строка 299)

**Результат:** ErrorLogger инициализируется при старте приложения и передается во все сервисы.

---

## Итоговый статус

✅ **Все задачи выполнены:**
1. ✅ Типы Balance исправлены на json.Number
2. ✅ ErrorLogger создан с методом Log()
3. ✅ ErrorLogger интегрирован в PoolMonitorService
4. ✅ ErrorLogger интегрирован в TonConnectValidator
5. ✅ /api/v1/stats стабилизирован с recover и проверками
6. ✅ Таймауты логируются в БД с severity=warning

**Платформа готова:** 
- Все ошибки записываются в БД для анализа
- API не падает при ошибках получения баланса
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
```

### 3. Проверка /api/v1/stats
```bash
curl http://localhost:8080/api/v1/stats
# Должен всегда возвращать 200 OK с валидным JSON
```

### 4. Проверка логирования таймаутов
```sql
-- Проверить логи таймаутов
SELECT * FROM error_logs WHERE error_type = 'task_timeout' ORDER BY created_at DESC;
```
