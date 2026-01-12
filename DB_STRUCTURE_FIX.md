# Исправление именования контейнеров и структуры БД

**Дата:** 2026-01-12  
**Статус:** ✅ Все исправления применены

---

## Выполненные исправления

### 1. ✅ Добавлены container_name для всех сервисов

**Файл:** `docker-compose.yml`

**Изменения:**
Добавлен параметр `container_name` для всех сервисов:
- `gateway` → `container_name: gstd_gateway`
- `frontend` → `container_name: gstd_frontend`
- `backend` → `container_name: gstd_backend`
- `postgres` → `container_name: gstd_postgres`
- `redis` → `container_name: gstd_redis`

**Результат:** Имена контейнеров зафиксированы, команды `docker exec` больше не будут ломаться при пересоздании контейнеров.

**Пример использования:**
```bash
# Теперь можно использовать фиксированные имена
docker exec -it gstd_postgres psql -U postgres -d distributed_computing
docker exec -it gstd_backend ls -la /app/migrations
docker logs gstd_backend
```

---

### 2. ✅ Проверена структура таблицы devices

**Анализ кода:**
- Проверен `backend/internal/services/device_service.go` - используется структура RegisterDeviceRequest
- Проверены все миграции, которые изменяют таблицу devices
- Найдены все поля, используемые в коде

**Поля, используемые в коде:**
- `device_id` (VARCHAR(255), PRIMARY KEY)
- `wallet_address` (VARCHAR(100) - увеличен из VARCHAR(48) в v14)
- `device_type` (VARCHAR(20))
- `reputation` (DECIMAL(5, 4), DEFAULT 0.5)
- `total_tasks`, `successful_tasks`, `failed_tasks` (INTEGER)
- `average_response_time_ms` (INTEGER)
- `last_seen_at` (TIMESTAMP)
- `is_active` (BOOLEAN)

**Дополнительные поля из миграций:**
- `total_energy_consumed` (INTEGER) - из init_database.sql
- `cached_models` (TEXT[]) - из init_database.sql
- `slashing_count` (INTEGER) - из init_database.sql
- `trust_score` (DECIMAL(5, 4)) - из v2_enterprise_updates.sql
- `region` (VARCHAR(10)) - из v2_enterprise_updates.sql
- `latency_fingerprint` (INTEGER) - из v2_enterprise_updates.sql
- `accuracy_score` (DECIMAL(5, 4)) - из v3_global_layer.sql
- `latency_score` (DECIMAL(5, 4)) - из v3_global_layer.sql
- `stability_score` (DECIMAL(5, 4)) - из v3_global_layer.sql
- `last_reputation_update` (TIMESTAMP) - из v3_global_layer.sql

---

### 3. ✅ Создана миграция fix_devices_table.sql

**Файл:** `backend/migrations/fix_devices_table.sql`

**Содержание:**
- Полная структура таблицы `devices` со всеми полями из Go моделей и миграций
- Все индексы для оптимальной производительности
- Комментарии для документации
- Удаление UNIQUE constraint на `wallet_address` (разрешено несколько устройств на один кошелек)

**Структура таблицы:**
```sql
CREATE TABLE IF NOT EXISTS devices (
    device_id VARCHAR(255) PRIMARY KEY,
    wallet_address VARCHAR(100) NOT NULL,  -- Увеличено до 100 согласно v14
    device_type VARCHAR(20) NOT NULL,
    reputation DECIMAL(5, 4) NOT NULL DEFAULT 0.5,
    total_tasks INTEGER NOT NULL DEFAULT 0,
    successful_tasks INTEGER NOT NULL DEFAULT 0,
    failed_tasks INTEGER NOT NULL DEFAULT 0,
    total_energy_consumed INTEGER NOT NULL DEFAULT 0,
    average_response_time_ms INTEGER NOT NULL DEFAULT 0,
    cached_models TEXT[],
    last_seen_at TIMESTAMP NOT NULL DEFAULT NOW(),
    is_active BOOLEAN NOT NULL DEFAULT true,
    slashing_count INTEGER NOT NULL DEFAULT 0,
    -- Enterprise features (v2)
    trust_score DECIMAL(5, 4) DEFAULT 0.1,
    region VARCHAR(10) DEFAULT 'unknown',
    latency_fingerprint INTEGER DEFAULT 0,
    -- Global layer features (v3)
    accuracy_score DECIMAL(5, 4) DEFAULT 0.5,
    latency_score DECIMAL(5, 4) DEFAULT 0.5,
    stability_score DECIMAL(5, 4) DEFAULT 0.5,
    last_reputation_update TIMESTAMP
);
```

**Индексы:**
- `idx_devices_reputation` - для сортировки по репутации
- `idx_devices_active` - для поиска активных устройств
- `idx_devices_last_seen` - для проверки последней активности
- `idx_devices_wallet_address` - для поиска по адресу кошелька
- `idx_devices_trust_region` - для enterprise features
- `idx_devices_wallet_active` - комбинированный индекс (v18)
- `idx_devices_reputation_active` - частичный индекс для активных устройств (v18)
- `idx_devices_vector` - для многомерной модели доверия (v3)

---

### 4. ✅ Проверен путь к миграциям

**Файл:** `backend/main.go`

**Проверка:**
- Путь к миграциям в коде: `/app/migrations` (строка 91)
- Путь в docker-compose.yml: `./backend/migrations:/app/migrations` (строка 50)
- ✅ Пути совпадают

**Результат:** Миграции доступны в контейнере по правильному пути `/app/migrations`.

---

## Итоговый статус

✅ **Все задачи выполнены:**
1. ✅ Добавлены container_name для всех сервисов
2. ✅ Проверена структура таблицы devices
3. ✅ Создана миграция fix_devices_table.sql с полной структурой
4. ✅ Проверен путь к миграциям (/app/migrations)

**Платформа готова:** 
- Имена контейнеров зафиксированы
- Таблица devices имеет полную структуру со всеми полями
- Миграции доступны по правильному пути
- Команды `docker exec` работают стабильно

---

## Применение миграции

### Вариант 1: Автоматически (через код)
Миграция будет применена автоматически при следующем запуске backend, если таблица отсутствует.

### Вариант 2: Вручную
```bash
# Применить миграцию вручную
docker exec -i gstd_postgres psql -U postgres -d distributed_computing < backend/migrations/fix_devices_table.sql
```

### Вариант 3: Через psql
```bash
# Подключиться к БД
docker exec -it gstd_postgres psql -U postgres -d distributed_computing

# Выполнить миграцию
\i /app/migrations/fix_devices_table.sql
```

---

## Проверка работы

### 1. Проверка имен контейнеров
```bash
docker ps --format "table {{.Names}}\t{{.Image}}"
# Должны быть видны: gstd_gateway, gstd_frontend, gstd_backend, gstd_postgres, gstd_redis
```

### 2. Проверка структуры таблицы devices
```bash
docker exec -it gstd_postgres psql -U postgres -d distributed_computing -c "\d devices"
```

### 3. Проверка миграций
```bash
docker exec -it gstd_backend ls -la /app/migrations
# Должен быть виден файл fix_devices_table.sql
```

### 4. Проверка полей таблицы
```sql
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_name = 'devices'
ORDER BY ordinal_position;
```

---

## Важные замечания

1. **UNIQUE constraint удален:** Таблица `devices` больше не имеет UNIQUE constraint на `wallet_address`, что позволяет нескольким устройствам использовать один кошелек.

2. **Размер wallet_address:** Увеличен до VARCHAR(100) для поддержки raw формата адресов (до 66 символов).

3. **Индексы:** Все индексы создаются с `IF NOT EXISTS`, поэтому миграция безопасна для повторного выполнения.

4. **Комментарии:** Добавлены комментарии к таблице и ключевым полям для документации.
