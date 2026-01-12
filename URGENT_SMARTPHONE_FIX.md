# Срочное исправление инфраструктуры для работы со смартфоном

**Дата:** 2026-01-12  
**Статус:** ✅ Все исправления применены

---

## Проблема

Смартфон не может зарегистрироваться и взять задачи. Требовалось срочно исправить:
1. Имена контейнеров в docker-compose.yml
2. CORS настройки в бэкенде
3. Логирование ошибок валидации в регистрации устройств

---

## 1. ✅ Проверены container_name в docker-compose.yml

**Файл:** `docker-compose.yml`

**Проверка всех сервисов:**

| Сервис | container_name | Строка | Статус |
|--------|---------------|--------|--------|
| gateway | `gstd_gateway` | 3 | ✅ |
| frontend | `gstd_frontend` | 27 | ✅ |
| backend | `gstd_backend` | 46 | ✅ |
| postgres | `gstd_postgres` | 88 | ✅ |
| redis | `gstd_redis` | 114 | ✅ |

**Результат:** Все сервисы имеют фиксированные имена контейнеров.

---

## 2. ✅ Обновлены CORS настройки в бэкенде

**Файл:** `backend/main.go` (строки 303-319)

### 2.1. Обновлен AllowOrigins

**Изменение:**
```go
// Было:
allowedOrigins := []string{"https://app.gstdtoken.com", "http://localhost:3000"}

// Стало:
allowedOrigins := []string{"https://app.gstdtoken.com", "http://82.115.48.228", "http://localhost:3000"}
```

**Результат:** Добавлен `http://82.115.48.228` в список разрешенных источников для работы со смартфоном по IP.

### 2.2. Обновлен AllowMethods

**Изменение:**
```go
// Было:
c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS, PATCH")

// Стало:
c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
```

**Результат:** Методы соответствуют требованиям: `GET, POST, PUT, DELETE, OPTIONS`.

### 2.3. Обновлен AllowHeaders

**Изменение:**
```go
// Было:
c.Header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Wallet-Address, DNT, User-Agent, X-Requested-With, If-Modified-Since, Cache-Control, Range")

// Стало:
c.Header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With")
```

**Результат:** Заголовки упрощены до необходимых: `Content-Type, Authorization, X-Requested-With`.

### 2.4. Проверен AllowCredentials

**Проверка:**
```go
c.Header("Access-Control-Allow-Credentials", "true")
```

**Результат:** `AllowCredentials: true` уже настроен корректно.

**Текущая конфигурация CORS:**
```go
allowedOrigins := []string{"https://app.gstdtoken.com", "http://82.115.48.228", "http://localhost:3000"}

c.Header("Access-Control-Allow-Origin", origin)
c.Header("Access-Control-Allow-Credentials", "true")
c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
c.Header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With")
```

---

## 3. ✅ Добавлено логирование ошибок валидации

**Файл:** `backend/internal/api/middleware_validation.go`

### 3.1. Обновлена сигнатура ValidateDeviceRequest

**Изменение:**
```go
// Было:
func ValidateDeviceRequest() gin.HandlerFunc

// Стало:
func ValidateDeviceRequest(errorLogger *services.ErrorLogger) gin.HandlerFunc
```

**Результат:** Middleware теперь принимает `errorLogger` для логирования ошибок валидации.

### 3.2. Добавлено логирование ошибок валидации JSON

**Добавлено:**
```go
if err := c.ShouldBindJSON(&req); err != nil {
    log.Printf("DeviceRegistration: Validation error - %v", err)
    if errorLogger != nil {
        errorLogger.LogError(ctx, "DEVICE_REGISTRATION_ERROR", err, services.SeverityWarning, map[string]interface{}{
            "error_type": "VALIDATION_ERROR",
            "error":      sanitizeValidationError(err),
            "device_id":  req.DeviceID,
        })
    }
    c.JSON(http.StatusBadRequest, gin.H{
        "error": "Invalid request: " + sanitizeValidationError(err),
    })
    c.Abort()
    return
}
```

**Результат:** Ошибки парсинга JSON теперь логируются в базу данных.

### 3.3. Добавлено логирование ошибок валидации TON адреса

**Добавлено:**
```go
if !isValidTONAddress(req.WalletAddress) {
    err := fmt.Errorf("Invalid TON address format: %s", req.WalletAddress)
    log.Printf("DeviceRegistration: %v", err)
    if errorLogger != nil {
        errorLogger.LogError(ctx, "DEVICE_REGISTRATION_ERROR", err, services.SeverityWarning, map[string]interface{}{
            "error_type":     "INVALID_TON_ADDRESS",
            "wallet_address": req.WalletAddress,
            "device_id":      req.DeviceID,
            "device_type":    req.DeviceType,
        })
    }
    c.JSON(http.StatusBadRequest, gin.H{
        "error": "Invalid TON address format",
    })
    c.Abort()
    return
}
```

**Результат:** Ошибки валидации TON адреса теперь логируются в базу данных.

### 3.4. Обновлен вызов ValidateDeviceRequest в routes.go

**Файл:** `backend/internal/api/routes.go` (строка 72)

**Изменение:**
```go
// Было:
v1.POST("/devices/register", ValidateDeviceRequest(), registerDevice(deviceService, errorLogger))

// Стало:
v1.POST("/devices/register", ValidateDeviceRequest(errorLogger), registerDevice(deviceService, errorLogger))
```

**Результат:** `errorLogger` теперь передается в middleware валидации.

---

## Итоговый статус

✅ **Все исправления применены:**

1. ✅ **container_name** - все сервисы имеют фиксированные имена (gstd_*)
2. ✅ **AllowOrigins** - добавлен `http://82.115.48.228` в список разрешенных источников
3. ✅ **AllowMethods** - установлены методы: `GET, POST, PUT, DELETE, OPTIONS`
4. ✅ **AllowHeaders** - установлены заголовки: `Content-Type, Authorization, X-Requested-With`
5. ✅ **AllowCredentials** - установлен в `true`
6. ✅ **Логирование** - все ошибки валидации в `ValidateDeviceRequest` логируются через `ErrorLogger`

**Платформа готова к работе со смартфоном:**
- CORS настроен для работы по IP адресу и домену
- Все необходимые методы и заголовки разрешены
- Ошибки валидации логируются в базу данных для отладки
- Имена контейнеров зафиксированы для стабильной работы

---

## Проверка работы

### 1. Проверка container_name
```bash
docker ps --format "table {{.Names}}\t{{.Image}}"
# Должны быть видны: gstd_gateway, gstd_frontend, gstd_backend, gstd_postgres, gstd_redis
```

### 2. Проверка CORS настроек
```bash
# Проверить CORS в main.go
grep -A 10 "allowedOrigins" backend/main.go
# Должен быть виден: "http://82.115.48.228"

# Проверить методы
grep "Access-Control-Allow-Methods" backend/main.go
# Должно быть: "GET, POST, PUT, DELETE, OPTIONS"

# Проверить заголовки
grep "Access-Control-Allow-Headers" backend/main.go
# Должно быть: "Content-Type, Authorization, X-Requested-With"
```

### 3. Тестирование CORS с IP адреса
```bash
# Проверить preflight запрос с IP
curl -X OPTIONS http://82.115.48.228/api/v1/devices/register \
  -H "Origin: http://82.115.48.228" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Content-Type" \
  -v

# Ожидаемые заголовки в ответе:
# Access-Control-Allow-Origin: http://82.115.48.228
# Access-Control-Allow-Credentials: true
# Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
# Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With
```

### 4. Тестирование регистрации устройства
```bash
# Попытка регистрации устройства с IP
curl -X POST http://82.115.48.228/api/v1/devices/register \
  -H "Origin: http://82.115.48.228" \
  -H "Content-Type: application/json" \
  -d '{
    "device_id": "test-device-123",
    "wallet_address": "EQD...",
    "device_type": "android"
  }' \
  -v

# Проверить логи бэкенда
docker logs gstd_backend | grep "DeviceRegistration"
```

### 5. Проверка ошибок в базе данных
```sql
-- Проверить ошибки валидации
SELECT * FROM error_logs 
WHERE error_type = 'DEVICE_REGISTRATION_ERROR' 
  AND (context->>'error_type' = 'VALIDATION_ERROR' 
    OR context->>'error_type' = 'INVALID_TON_ADDRESS')
ORDER BY created_at DESC 
LIMIT 10;
```

---

## Сводка изменений

### Измененные файлы:
1. **backend/main.go**
   - Добавлен `http://82.115.48.228` в `allowedOrigins`
   - Обновлен `Access-Control-Allow-Methods` на `"GET, POST, PUT, DELETE, OPTIONS"`
   - Обновлен `Access-Control-Allow-Headers` на `"Content-Type, Authorization, X-Requested-With"`

2. **backend/internal/api/middleware_validation.go**
   - Обновлена сигнатура `ValidateDeviceRequest` для приема `errorLogger`
   - Добавлено логирование ошибок парсинга JSON
   - Добавлено логирование ошибок валидации TON адреса
   - Добавлен импорт `fmt` и `log`

3. **backend/internal/api/routes.go**
   - Обновлен вызов `ValidateDeviceRequest` для передачи `errorLogger`

### Проверенные файлы (без изменений):
1. **docker-compose.yml** - все container_name уже присутствуют

---

## Важные замечания

1. **CORS с IP адреса:** Добавление `http://82.115.48.228` в `allowedOrigins` позволяет работать со смартфоном по IP адресу, что важно для тестирования.

2. **Логирование валидации:** Все ошибки валидации теперь логируются в базу данных, что позволяет отслеживать проблемы с форматом запросов от смартфонов.

3. **Упрощенные заголовки:** Список разрешенных заголовков упрощен до необходимых для работы со смартфоном.

4. **Двойное логирование:** Ошибки логируются и в консоль (для быстрой отладки), и в базу данных (для долгосрочного анализа).

---

## Рекомендации

1. **Мониторинг:** Настроить алерты на ошибки типа `DEVICE_REGISTRATION_ERROR` с `error_type: VALIDATION_ERROR` или `INVALID_TON_ADDRESS`.

2. **Анализ ошибок:** Регулярно проверять таблицу `error_logs` для выявления паттернов ошибок валидации от смартфонов.

3. **Тестирование:** Протестировать регистрацию устройств с различных смартфонов для убеждения в корректной работе CORS.

4. **Документация:** Обновить документацию API с указанием требований к формату запросов и примерами для мобильных устройств.
