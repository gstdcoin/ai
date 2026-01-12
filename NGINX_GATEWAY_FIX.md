# Исправления конфигурации Nginx Gateway

## Выполненные изменения

### 1. ✅ Добавлены зависимости для gateway в docker-compose.yml

```yaml
gateway:
  ...
  depends_on:
    - frontend
    - backend
```

Это гарантирует, что gateway будет запускаться только после того, как frontend и backend будут готовы.

### 2. ✅ Проверен gateway.conf

Имена контейнеров в `gateway.conf` совпадают с `container_name` в `docker-compose.yml`:
- `ubuntu_frontend_1` ✅
- `ubuntu_backend_1` ✅

Конфигурация правильная:
```nginx
location / {
    proxy_pass http://ubuntu_frontend_1:3000;
}

location /api/ {
    proxy_pass http://ubuntu_backend_1:8080;
}
```

### 3. ✅ Обновлена переменная NEXT_PUBLIC_API_URL

Изменено с:
```yaml
- NEXT_PUBLIC_API_URL=https://app.gstdtoken.com
```

На:
```yaml
- NEXT_PUBLIC_API_URL=https://app.gstdtoken.com/api
```

## ⚠️ Важное замечание

В коде фронтенда endpoint уже содержит `/api/v1/...`:

**Примеры использования:**
- `WalletConnect.tsx`: `${apiBase}/api/v1/users/login`
- `TasksPanel.tsx`: `/api/v1/tasks`
- `apiClient.ts`: endpoint содержит `/api/v1/...`

**Проблема:** Если `NEXT_PUBLIC_API_URL=https://app.gstdtoken.com/api`, то:
- В `apiClient.ts`: `${apiUrl}${endpoint}` = `https://app.gstdtoken.com/api/api/v1/...` ❌
- В других местах: `${apiBase}/api/v1/...` = `https://app.gstdtoken.com/api/api/v1/...` ❌

**Решение:** Нужно либо:
1. Изменить код фронтенда, чтобы endpoint не содержал `/api` (только `/v1/...`)
2. Или оставить `NEXT_PUBLIC_API_URL=https://app.gstdtoken.com` (без `/api`)

## Рекомендации

Если вы хотите, чтобы `NEXT_PUBLIC_API_URL` указывал на полный путь до API (`https://app.gstdtoken.com/api`), то нужно:

1. **Изменить `apiClient.ts`:**
   ```typescript
   // Было:
   const url = `${apiUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
   
   // Должно быть:
   const url = `${apiUrl.replace(/\/+$/, '')}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
   ```

2. **Изменить все endpoint в коде:**
   - Заменить `/api/v1/...` на `/v1/...`
   - Или использовать `NEXT_PUBLIC_API_URL` напрямую без добавления `/api`

## Текущее состояние

- ✅ Gateway имеет зависимости от frontend и backend
- ✅ Имена контейнеров в gateway.conf совпадают с docker-compose.yml
- ✅ `NEXT_PUBLIC_API_URL` установлен в `https://app.gstdtoken.com/api`
- ⚠️ Требуется проверка работы фронтенда (возможно дублирование `/api`)

## Проверка работы

После перезапуска контейнеров проверьте:

1. **Gateway доступен:**
   ```bash
   curl http://localhost
   ```

2. **Frontend доступен через gateway:**
   ```bash
   curl http://localhost -H "Host: app.gstdtoken.com"
   ```

3. **Backend доступен через gateway:**
   ```bash
   curl http://localhost/api/v1/health -H "Host: app.gstdtoken.com"
   ```

4. **Проверьте логи gateway:**
   ```bash
   docker logs gstd_gateway
   ```
