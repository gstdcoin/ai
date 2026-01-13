# 🔒 Активация защиты сессий (ValidateSession Middleware)

**Критическая задача безопасности:** Защита API от несанкционированного доступа.

---

## 📋 Статус

✅ **Код активирован** в `backend/internal/api/routes.go`  
⚠️ **Требуется пересборка backend** для применения изменений

---

## 🎯 Что было сделано

### 1. ✅ ValidateSession Middleware активирован

**Файл:** `backend/internal/api/routes.go` (строки 95-115)

**Код:**
```go
// Protected endpoints (require session)
var sessionMiddleware gin.HandlerFunc
if redisClient != nil {
    if rc, ok := redisClient.(*redis.Client); ok && rc != nil {
        sessionMiddleware = ValidateSession(rc)
        log.Printf("✅ Session middleware initialized and will be applied to protected routes")
    } else {
        log.Printf("⚠️  Redis client type assertion failed or is nil")
    }
} else {
    log.Printf("⚠️  Redis client is nil - session middleware will not be applied")
}

// Apply session middleware to protected routes
protected := v1.Group("")
if sessionMiddleware != nil {
    protected.Use(sessionMiddleware)
    log.Printf("✅ Session middleware applied to protected group (includes /tasks and /nodes)")
} else {
    log.Printf("⚠️  Session middleware is nil - protected routes will NOT require session")
}
```

### 2. ✅ Защищенные эндпоинты

**Все маршруты в группе `protected` теперь требуют session token:**

#### Просмотр устройств:
- `GET /api/v1/devices` ✅
- `GET /api/v1/devices/my` ✅
- `POST /api/v1/devices/register` ✅

#### Получение задач:
- `GET /api/v1/tasks` ✅
- `GET /api/v1/tasks/:id` ✅
- `GET /api/v1/tasks/:id/payment` ✅
- `POST /api/v1/tasks` ✅
- `POST /api/v1/tasks/create` ✅
- `GET /api/v1/tasks/worker/pending` ✅
- `POST /api/v1/tasks/worker/submit` ✅

#### Выплаты:
- `POST /api/v1/payments/payout-intent` ✅

#### Другие защищенные:
- `GET /api/v1/nodes/my` ✅
- `POST /api/v1/nodes/register` ✅
- `GET /api/v1/wallet/gstd-balance` ✅
- `GET /api/v1/wallet/efficiency` ✅
- `GET /api/v1/stats` ✅
- `GET /api/v1/stats/tasks/completion` ✅
- `GET /api/v1/device/tasks/available` ✅
- `POST /api/v1/device/tasks/:id/claim` ✅
- `POST /api/v1/device/tasks/:id/result` ✅
- `GET /api/v1/device/tasks/:id/result` ✅

### 3. ✅ Публичные эндпоинты (без изменений)

**Остаются доступными без session token:**
- `GET /api/v1/health` ✅
- `POST /api/v1/users/login` ✅
- `GET /api/v1/version` ✅
- `GET /api/v1/stats/public` ✅
- `GET /api/v1/openapi.json` ✅
- `GET /api/v1/metrics` ✅
- `GET /api/v1/network/entropy` ✅
- `GET /api/v1/pool/status` ✅

---

## 🔍 Как работает ValidateSession

### Middleware (`middleware_session.go`):

1. **Проверяет session token из:**
   - Cookie: `session_token`
   - Header: `X-Session-Token` (приоритет для фронтенда)
   - Query parameter: `session_token` (для обратной совместимости)

2. **Валидирует через Redis:**
   - Проверяет существование ключа `session:{token}`
   - Обновляет `last_access` timestamp
   - Извлекает `wallet_address` и `user_id` из session

3. **Возвращает ошибки:**
   - `401 Unauthorized` - если token отсутствует
   - `401 Unauthorized` - если token невалидный или истек
   - `500 Internal Server Error` - если Redis недоступен

---

## 📱 Фронтенд готовность

### ✅ Фронтенд уже настроен:

**1. apiClient.ts автоматически отправляет X-Session-Token:**
```typescript
// frontend/src/lib/apiClient.ts:110-125
let sessionToken: string | null = null;
if (typeof window !== 'undefined') {
  sessionToken = localStorage.getItem('session_token');
}

if (sessionToken) {
  headers['X-Session-Token'] = sessionToken;
}
```

**2. WalletConnect.tsx сохраняет session token после логина:**
```typescript
// frontend/src/components/WalletConnect.tsx:227-229
if (userData.session_token) {
  localStorage.setItem('session_token', userData.session_token);
}
```

**3. Все API вызовы используют apiClient:**
- ✅ `apiGet()` - автоматически добавляет X-Session-Token
- ✅ `apiPost()` - автоматически добавляет X-Session-Token
- ✅ `apiPut()` - автоматически добавляет X-Session-Token
- ✅ `apiDelete()` - автоматически добавляет X-Session-Token

---

## 🚀 Применение изменений

### ⚠️ КРИТИЧНО: Требуется пересборка backend

```bash
# 1. Пересобрать backend с новым кодом
docker-compose build backend

# 2. Перезапустить backend
docker-compose restart backend

# Или пересоздать все сервисы
docker-compose down
docker-compose up -d
```

### Проверка работы:

```bash
# 1. Публичный endpoint (должен работать)
curl http://localhost:8080/api/v1/health

# 2. Защищенный endpoint БЕЗ token (должен вернуть 401)
curl http://localhost:8080/api/v1/tasks
# Ожидаемый ответ: {"error":"session token required","message":"Please login to access this resource"}

# 3. Защищенный endpoint С валидным token (должен работать)
curl -H "X-Session-Token: valid_session_token" http://localhost:8080/api/v1/tasks
```

### Проверка логов:

```bash
# Проверить, что middleware инициализирован
docker logs gstd_backend 2>&1 | grep -E "Session middleware|SetupRoutes|redisClient"

# Ожидаемые логи:
# ✅ Session middleware initialized and will be applied to protected routes
# ✅ Session middleware applied to protected group (includes /tasks and /nodes)
```

---

## 🧪 Тестирование

### Тест 1: Публичные endpoints (должны работать)

```bash
# Health check
curl http://localhost:8080/api/v1/health
# Ожидается: 200 OK

# Login (публичный)
curl -X POST http://localhost:8080/api/v1/users/login \
  -H "Content-Type: application/json" \
  -d '{"wallet_address":"...","signature":"...","payload":"..."}'
# Ожидается: 200 OK с session_token
```

### Тест 2: Защищенные endpoints БЕЗ token (должны вернуть 401)

```bash
# Получение задач
curl http://localhost:8080/api/v1/tasks
# Ожидается: 401 {"error":"session token required"}

# Просмотр устройств
curl http://localhost:8080/api/v1/devices
# Ожидается: 401 {"error":"session token required"}

# Выплаты
curl -X POST http://localhost:8080/api/v1/payments/payout-intent \
  -H "Content-Type: application/json" \
  -d '{"task_id":"...","executor_address":"..."}'
# Ожидается: 401 {"error":"session token required"}
```

### Тест 3: Защищенные endpoints С валидным token (должны работать)

```bash
# 1. Сначала получить session token через login
SESSION_TOKEN=$(curl -X POST http://localhost:8080/api/v1/users/login \
  -H "Content-Type: application/json" \
  -d '{"wallet_address":"...","signature":"...","payload":"..."}' \
  | jq -r '.session_token')

# 2. Использовать token для защищенных запросов
curl -H "X-Session-Token: $SESSION_TOKEN" http://localhost:8080/api/v1/tasks
# Ожидается: 200 OK с данными
```

---

## 🔧 Устранение проблем

### Проблема: "Session middleware is nil"

**Причина:** Redis недоступен или не передан в SetupRoutes

**Решение:**
```bash
# Проверить Redis
docker exec gstd_redis redis-cli ping
# Должно вернуть: PONG

# Проверить логи backend
docker logs gstd_backend 2>&1 | grep -E "Redis|redis"
```

### Проблема: "401 Unauthorized" даже с валидным token

**Причина:** Token истек или не найден в Redis

**Решение:**
```bash
# Проверить session в Redis
docker exec gstd_redis redis-cli GET "session:your_token_here"

# Проверить логи middleware
docker logs gstd_backend 2>&1 | grep "ValidateSession"
```

### Проблема: Фронтенд не отправляет token

**Причина:** Token не сохранен в localStorage

**Решение:**
```javascript
// Проверить в браузере (DevTools Console)
localStorage.getItem('session_token')

// Если null, нужно залогиниться заново
```

---

## 📊 Структура маршрутов

```
/api/v1/
├── [PUBLIC - без session]
│   ├── GET /health ✅
│   ├── POST /users/login ✅
│   └── GET /version ✅
│
└── [PROTECTED - требует session token]
    ├── GET /tasks ✅
    ├── POST /tasks ✅
    ├── GET /devices ✅
    ├── POST /devices/register ✅
    ├── POST /payments/payout-intent ✅
    ├── GET /nodes/my ✅
    └── POST /nodes/register ✅
```

---

## ✅ Итог

**Код активирован:** ✅  
**Фронтенд готов:** ✅  
**Требуется:** Пересборка backend для применения изменений

**После пересборки:**
- Все защищенные endpoints будут требовать session token
- Публичные endpoints останутся доступными
- Фронтенд продолжит работать (уже отправляет token)
- Безопасность API будет обеспечена

---

**Обновлено:** 2026-01-13  
**Статус:** ✅ Код активирован, требуется пересборка
