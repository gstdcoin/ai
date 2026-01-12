# Исправление ошибок JSON unmarshaling и внедрение ErrorLogger

**Дата:** 2026-01-12  
**Статус:** ✅ Все исправления применены

---

## Выполненные исправления

### 1. ✅ Исправлена ошибка unmarshaling Balance в TonAPI

**Файл:** `backend/internal/services/ton_service.go`  
**Строки:** 116-150

**Проблема:**
```
json: cannot unmarshal number into Go struct field .balance of type string
```

**Исправление:**
- Изменен тип поля `Balance` с `string` на `json.Number` (строка 121)
- Обновлена логика парсинга для поддержки как чисел, так и строк:
  ```go
  var balanceNano int64
  balanceNanoInt, err := b.Balance.Int64()
  if err != nil {
      // If Int64 fails, try parsing as float64 first
      if balanceFloat, floatErr := b.Balance.Float64(); floatErr == nil {
          balanceNano = int64(balanceFloat)
      } else {
          return 0, fmt.Errorf("failed to parse jetton balance: %w", err)
      }
  } else {
      balanceNano = balanceNanoInt
  }
  ```

**Результат:** TonAPI может возвращать balance как число или строку, оба формата обрабатываются корректно.

---

### 2. ✅ Создан ErrorLogger для записи ошибок в БД

**Файл:** `backend/internal/services/error_logger.go` (новый файл)

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

**Методы:**
- `LogError()` - базовый метод логирования
- `LogCritical()` - логирование критических ошибок
- `GetRecentErrors()` - получение последних ошибок из БД

---

### 3. ✅ Интегрирован ErrorLogger в PoolMonitorService

**Файл:** `backend/internal/services/pool_monitor_service.go`

**Изменения:**
1. Добавлено поле `errorLogger *ErrorLogger` в структуру (строка 23)
2. Добавлен метод `SetErrorLogger()` для установки логгера (строки 61-64)
3. Логирование ошибок JSON декодирования (строки 91-98):
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
4. Логирование ошибок парсинга баланса (строки 103-110)

**Результат:** Все ошибки декодирования JSON и парсинга баланса записываются в БД для анализа.

---

### 4. ✅ Интегрирован ErrorLogger в TimeoutService

**Файл:** `backend/internal/services/timeout_service.go`

**Изменения:**
1. Добавлено поле `errorLogger *ErrorLogger` в структуру (строка 13)
2. Добавлен метод `SetErrorLogger()` для установки логгера (строки 21-24)
3. Логирование каждого таймаута задачи (строки 69-75):
   ```go
   if s.errorLogger != nil {
       s.errorLogger.LogError(ctx, "task_timeout", fmt.Errorf("task %s timed out", task.TaskID), SeverityWarning, map[string]interface{}{
           "task_id":   task.TaskID,
           "device_id": deviceID,
       })
   }
   ```

**Результат:** Все таймауты задач записываются в БД с информацией о задаче и устройстве.

---

### 5. ✅ Исправлен эндпоинт /api/v1/stats

**Файл:** `backend/internal/api/routes_stats.go`  
**Строки:** 76-90

**Изменения:**
1. Явная установка `goldenReserveXAUt = 0` при ошибке получения баланса (строка 83)
2. Проверка на отрицательные значения (строки 88-90):
   ```go
   // Ensure balance is never negative and defaults to 0 if not found
   if goldenReserveXAUt < 0 {
       goldenReserveXAUt = 0
   }
   ```

**Результат:** Эндпоинт всегда возвращает валидный JSON с балансом "0" при ошибках, вместо 500 ошибки.

---

## Интеграция ErrorLogger в main.go

**Важно:** Для работы ErrorLogger необходимо инициализировать его в `main.go` и передать в сервисы:

```go
// В main.go после создания db
errorLogger := services.NewErrorLogger(db)

// Установить в PoolMonitorService
poolMonitorService.SetErrorLogger(errorLogger)

// Установить в TimeoutService
timeoutService.SetErrorLogger(errorLogger)
```

---

## Проверка работы

### 1. Проверка исправления Balance

**Тест:**
```bash
# Запустить запрос к TonAPI через GetJettonBalance
# Убедиться, что нет ошибок unmarshaling
```

**Ожидаемый результат:** Balance корректно парсится независимо от формата (число или строка).

---

### 2. Проверка ErrorLogger

**Тест:**
```sql
-- Проверить, что таблица error_logs создана
SELECT * FROM error_logs ORDER BY created_at DESC LIMIT 10;
```

**Ожидаемый результат:** Таблица создана, ошибки записываются.

---

### 3. Проверка /api/v1/stats

**Тест:**
```bash
curl http://localhost:8080/api/v1/stats
```

**Ожидаемый результат:** Всегда возвращается 200 OK с валидным JSON, даже если баланс не найден (возвращается 0).

---

## Следующие шаги

1. **Обновить main.go:**
   - Инициализировать ErrorLogger
   - Передать в PoolMonitorService и TimeoutService

2. **Проверить работу:**
   - Убедиться, что ошибки записываются в БД
   - Проверить, что /api/v1/stats не падает при ошибках

3. **Мониторинг:**
   - Настроить алерты на критические ошибки из error_logs
   - Анализировать паттерны ошибок для оптимизации

---

## Итоговый статус

✅ **Все исправления применены:**
- Balance исправлен на json.Number в ton_service.go
- ErrorLogger создан и готов к использованию
- Интеграция в PoolMonitorService и TimeoutService выполнена
- /api/v1/stats возвращает безопасные значения при ошибках

**Требуется:** Обновить main.go для инициализации ErrorLogger.
