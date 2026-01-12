# Настройка для тестирования на реальных устройствах

**Дата:** 2026-01-12  
**Статус:** ✅ Все настройки применены

---

## 1. ✅ Обновлен NEXT_PUBLIC_API_URL во фронтенде

**Файл:** `frontend/.env`

**Изменение:**
- **Было:** `NEXT_PUBLIC_API_URL=http://82.115.48.228`
- **Стало:** `NEXT_PUBLIC_API_URL=https://app.gstdtoken.com`

**Результат:** Фронтенд теперь использует HTTPS домен для всех API запросов.

**Проверка:**
```bash
cat frontend/.env
# Должно быть: NEXT_PUBLIC_API_URL=https://app.gstdtoken.com
```

---

## 2. ✅ Обновлен gateway.conf (Nginx)

**Файл:** `gateway.conf`

### 2.1. Проверка proxy_set_header Host

**Статус:** ✅ `proxy_set_header Host $host` настроен корректно для обоих location блоков:
- `/` (frontend) - строка 21
- `/api/` (backend) - строка 29

**Результат:** Бэкенд получает правильный заголовок Host с доменом `app.gstdtoken.com`.

### 2.2. Обновлены имена контейнеров

**Изменения:**
- **Было:** `proxy_pass http://ubuntu-frontend-1:3000;` (строка 20)
- **Стало:** `proxy_pass http://gstd_frontend:3000;`

- **Было:** `proxy_pass http://ubuntu-backend-1:8080;` (строка 28)
- **Стало:** `proxy_pass http://gstd_backend:8080;`

**Результат:** Nginx теперь использует фиксированные имена контейнеров из `docker-compose.yml`.

**Текущая конфигурация:**
```nginx
location / {
    proxy_pass http://gstd_frontend:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}

location /api/ {
    proxy_pass http://gstd_backend:8080;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

---

## 3. ✅ Проверена CORS-политика в бэкенде

**Файл:** `backend/main.go` (строки 303-325)

**Текущая конфигурация:**

```go
// CORS headers (adjust for production)
origin := c.GetHeader("Origin")
allowedOrigins := []string{"https://app.gstdtoken.com", "http://localhost:3000"}

// Always set CORS headers for allowed origins
if origin != "" {
    for _, allowed := range allowedOrigins {
        if origin == allowed {
            c.Header("Access-Control-Allow-Origin", origin)
            c.Header("Access-Control-Allow-Credentials", "true")
            c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS, PATCH")
            c.Header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Wallet-Address, DNT, User-Agent, X-Requested-With, If-Modified-Since, Cache-Control, Range")
            c.Header("Access-Control-Expose-Headers", "Content-Length, Content-Range")
            break
        }
    }
}

// Handle preflight requests
if c.Request.Method == "OPTIONS" {
    c.AbortWithStatus(204)
    return
}
```

**Проверка:**
- ✅ `https://app.gstdtoken.com` присутствует в списке разрешенных источников
- ✅ `http://localhost:3000` разрешен для локальной разработки
- ✅ Настроены все необходимые CORS заголовки:
  - `Access-Control-Allow-Origin`
  - `Access-Control-Allow-Credentials`
  - `Access-Control-Allow-Methods`
  - `Access-Control-Allow-Headers`
  - `Access-Control-Expose-Headers`
- ✅ Обработка preflight запросов (OPTIONS) реализована

**Результат:** CORS-политика правильно настроена для работы с `https://app.gstdtoken.com`.

---

## Итоговый статус

✅ **Все настройки применены:**

1. ✅ **NEXT_PUBLIC_API_URL** установлен в `https://app.gstdtoken.com` в `frontend/.env`
2. ✅ **proxy_set_header Host $host** настроен корректно в `gateway.conf` для обоих location блоков
3. ✅ **Имена контейнеров** обновлены в `gateway.conf` на фиксированные (`gstd_frontend`, `gstd_backend`)
4. ✅ **CORS-политика** разрешает запросы с `https://app.gstdtoken.com` в `backend/main.go`

**Платформа готова к тестированию на реальных устройствах:**
- Фронтенд использует HTTPS домен для API запросов
- Nginx корректно проксирует запросы с правильными заголовками
- Бэкенд разрешает CORS запросы с production домена
- Все компоненты используют фиксированные имена контейнеров

---

## Проверка работы

### 1. Проверка .env фронтенда
```bash
cat frontend/.env
# Должно быть: NEXT_PUBLIC_API_URL=https://app.gstdtoken.com
```

### 2. Проверка gateway.conf
```bash
grep -A 5 "location /" gateway.conf
# Должны быть видны правильные имена контейнеров и proxy_set_header Host $host
```

### 3. Проверка CORS в бэкенде
```bash
grep -A 10 "allowedOrigins" backend/main.go
# Должен быть виден https://app.gstdtoken.com в списке
```

### 4. Тестирование CORS
```bash
# Проверить preflight запрос
curl -X OPTIONS https://app.gstdtoken.com/api/v1/stats \
  -H "Origin: https://app.gstdtoken.com" \
  -H "Access-Control-Request-Method: GET" \
  -v

# Ожидаемые заголовки в ответе:
# Access-Control-Allow-Origin: https://app.gstdtoken.com
# Access-Control-Allow-Credentials: true
# Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS, PATCH
```

### 5. Тестирование API запроса
```bash
# Проверить обычный запрос
curl https://app.gstdtoken.com/api/v1/stats \
  -H "Origin: https://app.gstdtoken.com" \
  -v

# Должен вернуться JSON с данными статистики
```

### 6. Проверка работы фронтенда
```bash
# В браузере открыть https://app.gstdtoken.com
# Проверить в DevTools (Network) что все запросы идут на https://app.gstdtoken.com/api/...
# Проверить отсутствие CORS ошибок в консоли
```

---

## Сводка изменений

### Измененные файлы:
1. **frontend/.env**
   - Обновлен `NEXT_PUBLIC_API_URL` с `http://82.115.48.228` на `https://app.gstdtoken.com`

2. **gateway.conf**
   - Обновлены имена контейнеров в `proxy_pass`:
     - `ubuntu-frontend-1` → `gstd_frontend`
     - `ubuntu-backend-1` → `gstd_backend`
   - `proxy_set_header Host $host` уже был настроен корректно

### Проверенные файлы (без изменений):
1. **backend/main.go** - CORS уже правильно настроен с `https://app.gstdtoken.com`

---

## Важные замечания

1. **HTTPS обязателен:** Все запросы должны идти через HTTPS для безопасности и корректной работы CORS.

2. **Имена контейнеров:** Использование фиксированных имен контейнеров (`gstd_*`) обеспечивает стабильность работы Nginx после перезапуска контейнеров.

3. **CORS credentials:** `Access-Control-Allow-Credentials: true` позволяет отправлять cookies и авторизационные заголовки в cross-origin запросах.

4. **Preflight запросы:** OPTIONS запросы обрабатываются автоматически и возвращают статус 204 (No Content).

---

## Рекомендации

1. **Мониторинг:** Настроить мониторинг CORS ошибок в логах бэкенда для отслеживания проблем с доступом.

2. **Тестирование:** Протестировать работу с реальными устройствами, убедившись, что все API запросы проходят успешно.

3. **Безопасность:** В production рекомендуется ограничить список разрешенных источников только необходимыми доменами.

4. **Логирование:** Добавить логирование CORS запросов для отладки проблем с доступом.
