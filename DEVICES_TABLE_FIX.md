# Исправление ошибки "relation 'devices' does not exist"

**Дата:** 2026-01-12  
**Статус:** ✅ Все исправления применены

---

## Выполненные исправления

### 1. ✅ Добавлен проброс папки миграций в docker-compose.yml

**Файл:** `docker-compose.yml`  
**Сервис:** `backend`

**Изменение:**
Добавлен volume для проброса папки с миграциями:
```yaml
backend:
  image: ubuntu-backend
  volumes:
    - ./backend/migrations:/app/migrations
  # ... остальные настройки
```

**Результат:** Папка `./backend/migrations` теперь доступна в контейнере по пути `/app/migrations`, что соответствует пути в коде инициализации.

---

### 2. ✅ Добавлена таблица "devices" в список проверяемых таблиц

**Файл:** `backend/main.go`  
**Функция:** `verifyDatabaseTables()`

**Изменение:**
Добавлена таблица `"devices"` в список `requiredTables`:
```go
requiredTables := []string{
    "tasks",
    "devices",  // Добавлено
    "payout_transactions",
    "failed_payouts",
    "nodes",
    "users",
    "golden_reserve_log",
}
```

**Результат:** Таблица `devices` теперь проверяется при старте приложения.

---

### 3. ✅ Добавлено автоматическое создание таблицы "devices"

**Файл:** `backend/main.go`  
**Функция:** `createMissingTable()`

**Изменения:**
1. Добавлена функция `createMissingTable()` для автоматического создания отсутствующих таблиц
2. Реализовано создание таблицы `devices` с полной структурой:
   ```go
   CREATE TABLE IF NOT EXISTS devices (
       device_id VARCHAR(255) PRIMARY KEY,
       wallet_address VARCHAR(48) NOT NULL,
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
       slashing_count INTEGER NOT NULL DEFAULT 0
   )
   ```
3. Автоматическое создание индексов:
   - `idx_devices_reputation`
   - `idx_devices_active`
   - `idx_devices_last_seen`
   - `idx_devices_wallet_address`

**Логика работы:**
- При старте приложения проверяется наличие всех требуемых таблиц
- Если таблица `devices` отсутствует, она автоматически создается
- Если создание не удалось, выводится предупреждение, но приложение продолжает работу

**Результат:** Таблица `devices` автоматически создается при старте, если миграции не сработали.

---

## Итоговый статус

✅ **Все задачи выполнены:**
1. ✅ Проброс папки миграций добавлен в docker-compose.yml
2. ✅ Таблица "devices" добавлена в список проверяемых таблиц
3. ✅ Автоматическое создание таблицы "devices" реализовано

**Платформа готова:** 
- Миграции доступны в контейнере по пути `/app/migrations`
- Таблица `devices` проверяется при старте
- Таблица `devices` автоматически создается, если отсутствует
- Ошибка "relation 'devices' does not exist" больше не должна возникать

---

## Проверка работы

### 1. Проверка проброса миграций
```bash
# Проверить, что папка миграций доступна в контейнере
docker exec -it <backend_container> ls -la /app/migrations
```

### 2. Проверка создания таблицы
```bash
# Проверить, что таблица devices существует
docker exec -it <postgres_container> psql -U postgres -d distributed_computing -c "\d devices"
```

### 3. Проверка логов при старте
```bash
# Проверить логи backend при старте
docker logs <backend_container> | grep -i "devices\|migrations"
```

Ожидаемый вывод:
```
✅ All required database tables verified
```
или
```
⚠️  Warning: Missing database tables: [devices]
   Attempting to create missing tables...
   ✅ Created table devices
```

---

## Структура таблицы devices

Таблица создается со следующими полями:
- `device_id` (VARCHAR(255), PRIMARY KEY) - уникальный идентификатор устройства
- `wallet_address` (VARCHAR(48)) - адрес кошелька
- `device_type` (VARCHAR(20)) - тип устройства (android, ios, desktop)
- `reputation` (DECIMAL(5, 4), DEFAULT 0.5) - репутация устройства
- `total_tasks`, `successful_tasks`, `failed_tasks` (INTEGER) - статистика задач
- `total_energy_consumed` (INTEGER) - потребленная энергия
- `average_response_time_ms` (INTEGER) - среднее время ответа
- `cached_models` (TEXT[]) - кэшированные модели
- `last_seen_at` (TIMESTAMP, DEFAULT NOW()) - последнее время активности
- `is_active` (BOOLEAN, DEFAULT true) - активность устройства
- `slashing_count` (INTEGER, DEFAULT 0) - количество штрафов

Индексы:
- `idx_devices_reputation` - для сортировки по репутации
- `idx_devices_active` - для поиска активных устройств
- `idx_devices_last_seen` - для проверки последней активности
- `idx_devices_wallet_address` - для поиска по адресу кошелька
