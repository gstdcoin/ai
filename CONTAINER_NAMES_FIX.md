# Исправление имен контейнеров для избежания конфликтов

## Выполненные изменения

### 1. ✅ Удалены все `container_name` из docker-compose.yml

**Было:**
```yaml
gateway:
  container_name: gstd_gateway
frontend:
  container_name: ubuntu_frontend_1
backend:
  container_name: ubuntu_backend_1
postgres:
  container_name: ubuntu_postgres_1
redis:
  container_name: ubuntu_redis_1
```

**Стало:**
- Все `container_name` удалены
- Docker будет автоматически генерировать имена контейнеров на основе названий сервисов
- Формат: `<project_name>-<service_name>-<number>`

**Преимущества:**
- ✅ Нет конфликтов имен при пересоздании контейнеров
- ✅ Docker может корректно управлять жизненным циклом контейнеров
- ✅ Легче пересоздавать контейнеры без ошибок "name is already in use"

### 2. ✅ Обновлен gateway.conf для использования названий сервисов

**Было:**
```nginx
set $frontend ubuntu_frontend_1;
set $backend ubuntu_backend_1;
```

**Стало:**
```nginx
set $frontend frontend;
set $backend backend;
```

**Преимущества:**
- ✅ Используются стандартные имена сервисов из docker-compose.yml
- ✅ Docker DNS автоматически резолвит имена сервисов
- ✅ Работает с динамическими IP-адресами контейнеров
- ✅ Не зависит от конкретных имен контейнеров

### 3. ✅ Проверены настройки хостов в бэкенде

**В docker-compose.yml для backend:**
```yaml
environment:
  - DB_HOST=postgres      ✅ Правильно
  - REDIS_HOST=redis      ✅ Правильно
```

**Проверка:**
- ✅ `DB_HOST=postgres` - использует имя сервиса из docker-compose.yml
- ✅ `REDIS_HOST=redis` - использует имя сервиса из docker-compose.yml
- ✅ Docker DNS автоматически резолвит эти имена в IP-адреса контейнеров

## Итоговое состояние

### docker-compose.yml
- ✅ Все сервисы без `container_name`
- ✅ Используются только названия сервисов: `gateway`, `frontend`, `backend`, `postgres`, `redis`
- ✅ `DB_HOST=postgres` и `REDIS_HOST=redis` настроены правильно

### gateway.conf
- ✅ Использует `frontend` вместо `ubuntu_frontend_1`
- ✅ Использует `backend` вместо `ubuntu_backend_1`
- ✅ DNS-резолвер Docker (`127.0.0.11`) автоматически обновляет IP-адреса

## Как это работает

1. **Docker Compose создает сеть:**
   - Все сервисы в одной сети `gstd_network`
   - Docker DNS резолвит имена сервисов в IP-адреса

2. **Nginx использует DNS-резолвер:**
   - `resolver 127.0.0.11 valid=5s;` - использует встроенный DNS Docker
   - `set $frontend frontend;` - переменная с именем сервиса
   - `proxy_pass http://$frontend:3000;` - DNS резолвит `frontend` в IP

3. **Бэкенд подключается к БД и Redis:**
   - `DB_HOST=postgres` - Docker DNS резолвит в IP контейнера postgres
   - `REDIS_HOST=redis` - Docker DNS резолвит в IP контейнера redis

## Преимущества новой конфигурации

1. **Нет конфликтов имен:**
   - Docker автоматически управляет именами контейнеров
   - Можно безопасно пересоздавать контейнеры

2. **Динамическая маршрутизация:**
   - При перезапуске контейнеров IP-адреса могут измениться
   - Docker DNS автоматически обновляет резолвинг
   - Nginx с `resolver 127.0.0.11` получает актуальные IP

3. **Простота управления:**
   - Не нужно помнить конкретные имена контейнеров
   - Используются стандартные имена сервисов
   - Легче масштабировать и изменять конфигурацию

## Проверка после перезапуска

После применения изменений проверьте:

1. **Контейнеры запущены:**
   ```bash
   docker-compose ps
   ```

2. **Nginx видит сервисы:**
   ```bash
   docker exec gstd_gateway nslookup frontend
   docker exec gstd_gateway nslookup backend
   ```

3. **Бэкенд подключается к БД:**
   ```bash
   docker logs <backend_container_name> | grep -i "database\|postgres"
   ```

4. **Бэкенд подключается к Redis:**
   ```bash
   docker logs <backend_container_name> | grep -i "redis"
   ```

## Важно

При первом применении изменений может потребоваться:

1. **Остановить и удалить старые контейнеры:**
   ```bash
   docker-compose down
   ```

2. **Запустить заново:**
   ```bash
   docker-compose up -d
   ```

Это гарантирует, что старые контейнеры с фиксированными именами не будут конфликтовать с новыми.
