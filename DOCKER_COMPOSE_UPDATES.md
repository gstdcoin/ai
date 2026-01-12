# Обновления docker-compose.yml и фронтенда

## Выполненные изменения

### 1. ✅ Добавлено логирование для всех сервисов

Для каждого сервиса добавлена конфигурация логирования:
```yaml
logging:
  driver: "json-file"
  options:
    max-size: "10m"
    max-file: "3"
```

Это ограничивает размер каждого лог-файла до 10MB и хранит максимум 3 файла (30MB на сервис).

**Обновленные сервисы:**
- ✅ gateway
- ✅ frontend
- ✅ backend
- ✅ postgres
- ✅ redis

### 2. ✅ Проверен restart: always

Все сервисы уже имели `restart: always`:
- ✅ gateway
- ✅ frontend
- ✅ backend
- ✅ postgres
- ✅ redis

### 3. ✅ Исправлен NEXT_PUBLIC_API_URL

**Изменено в docker-compose.yml:**
```yaml
# Было:
- NEXT_PUBLIC_API_URL=https://app.gstdtoken.com/api

# Стало:
- NEXT_PUBLIC_API_URL=https://app.gstdtoken.com
```

**Обновлен код фронтенда для удаления лишних слэшей:**

1. **`frontend/src/lib/apiClient.ts`:**
   ```typescript
   // Добавлено удаление завершающих слэшей
   const apiUrl = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080').replace(/\/+$/, '');
   ```

2. **`frontend/src/components/dashboard/NewTaskModal.tsx`:**
   ```typescript
   // Добавлено удаление завершающих слэшей
   const paymentApiUrl = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080').replace(/\/+$/, '');
   ```

3. **`frontend/src/lib/taskWorker.ts`:**
   ```typescript
   // Добавлено удаление завершающих слэшей перед преобразованием в WebSocket URL
   const apiUrl = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080').replace(/\/+$/, '');
   ```

**Уже было в коде (не требовало изменений):**
- Все остальные компоненты уже используют `.replace(/\/+$/, '')` для удаления завершающих слэшей

## Результат

### Логирование
- ✅ Все сервисы имеют ограничение размера логов (10MB на файл, максимум 3 файла)
- ✅ Логи не переполнят диск (максимум ~150MB для всех сервисов)

### Restart Policy
- ✅ Все сервисы автоматически перезапускаются при сбоях

### NEXT_PUBLIC_API_URL
- ✅ Установлен на `https://app.gstdtoken.com` (без завершающего слэша)
- ✅ Код фронтенда гарантирует удаление завершающих слэшей перед использованием
- ✅ Нет дублирования слэшей в URL запросов

## Проверка

После перезапуска контейнеров проверьте:

1. **Логи ограничены:**
   ```bash
   docker logs --tail 100 gstd_gateway
   docker logs --tail 100 ubuntu_frontend_1
   docker logs --tail 100 ubuntu_backend_1
   ```

2. **Размер логов:**
   ```bash
   du -sh /var/lib/docker/containers/*/*-json.log
   ```

3. **API URL в фронтенде:**
   - Откройте консоль браузера
   - Проверьте, что запросы идут на `https://app.gstdtoken.com/api/v1/...` (без двойных слэшей)
