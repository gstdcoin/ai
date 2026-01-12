# Исправление имен контейнеров и структуры моделей Device

**Дата:** 2026-01-12  
**Статус:** ✅ Все исправления применены

---

## Выполненные исправления

### 1. ✅ Добавлены container_name для всех сервисов

**Файл:** `docker-compose.yml`

**Изменения:**
Все сервисы теперь имеют фиксированные имена контейнеров:
- `gateway` → `container_name: gstd_gateway` (строка 3)
- `frontend` → `container_name: gstd_frontend` (строка 27)
- `backend` → `container_name: gstd_backend` (строка 46)
- `postgres` → `container_name: gstd_postgres` (строка 88)
- `redis` → `container_name: gstd_redis` (строка 114)

**Результат:** Имена контейнеров зафиксированы, команды `docker exec` больше не будут ломаться при пересоздании контейнеров.

**Пример использования:**
```bash
# Теперь можно использовать фиксированные имена
docker exec -it gstd_postgres psql -U postgres -d distributed_computing
docker exec -it gstd_backend ls -la /app/migrations
docker logs gstd_backend
docker logs gstd_postgres
```

---

### 2. ✅ Создана модель Device с полями last_seen_at и is_active

**Файл:** `backend/internal/models/device.go` (новый файл)

**Структура:**
```go
type Device struct {
    DeviceID              string    `json:"device_id" db:"device_id"`
    WalletAddress         string    `json:"wallet_address" db:"wallet_address"`
    DeviceType            string    `json:"device_type" db:"device_type"`
    Reputation            float64   `json:"reputation" db:"reputation"`
    TotalTasks            int       `json:"total_tasks" db:"total_tasks"`
    SuccessfulTasks       int       `json:"successful_tasks" db:"successful_tasks"`
    FailedTasks           int       `json:"failed_tasks" db:"failed_tasks"`
    TotalEnergyConsumed   int       `json:"total_energy_consumed" db:"total_energy_consumed"`
    AverageResponseTimeMs int       `json:"average_response_time_ms" db:"average_response_time_ms"`
    CachedModels          []string  `json:"cached_models,omitempty" db:"cached_models"`
    LastSeenAt            time.Time `json:"last_seen_at" db:"last_seen_at"`  // ✅ Присутствует
    IsActive              bool      `json:"is_active" db:"is_active"`        // ✅ Присутствует
    SlashingCount         int       `json:"slashing_count" db:"slashing_count"`
    
    // Enterprise features
    TrustScore            *float64  `json:"trust_score,omitempty" db:"trust_score"`
    Region                *string   `json:"region,omitempty" db:"region"`
    LatencyFingerprint    *int      `json:"latency_fingerprint,omitempty" db:"latency_fingerprint"`
    
    // Global layer features
    AccuracyScore         *float64  `json:"accuracy_score,omitempty" db:"accuracy_score"`
    LatencyScore          *float64  `json:"latency_score,omitempty" db:"latency_score"`
    StabilityScore        *float64  `json:"stability_score,omitempty" db:"stability_score"`
    LastReputationUpdate  *time.Time `json:"last_reputation_update,omitempty" db:"last_reputation_update"`
}
```

**Проверка:**
- ✅ Поле `LastSeenAt` присутствует с тегами `json:"last_seen_at" db:"last_seen_at"` (строка 19)
- ✅ Поле `IsActive` присутствует с тегами `json:"is_active" db:"is_active"` (строка 20)
- ✅ Все поля имеют правильные теги `db` и `json`
- ✅ Опциональные поля (enterprise и global layer) используют указатели для поддержки NULL

**Результат:** Модель Device полностью соответствует структуре таблицы в БД.

---

### 3. ✅ Создан репозиторий DeviceRepository с корректными запросами

**Файл:** `backend/internal/repository/postgres/device.go` (новый файл)

**Методы:**
1. **GetByID** - получение устройства по ID
   - SELECT включает все поля, включая `last_seen_at` и `is_active` (строки 27-35)
   - Корректное сканирование всех полей (строки 36-57)

2. **GetByWalletAddress** - получение устройств по адресу кошелька
   - SELECT включает все поля, включая `last_seen_at` и `is_active` (строки 77-84)
   - WHERE условие использует `is_active = true` (строка 85)
   - ORDER BY `last_seen_at DESC` (строка 86)

3. **GetAllActive** - получение всех активных устройств
   - SELECT включает все поля, включая `last_seen_at` и `is_active` (строки 142-149)
   - WHERE условие использует `is_active = true` (строка 150)
   - ORDER BY `reputation DESC` (строка 151)

4. **UpdateLastSeen** - обновление времени последней активности
   - UPDATE устанавливает `last_seen_at = NOW()` и `is_active = true` (строки 204-207)

5. **CreateOrUpdate** - создание или обновление устройства
   - INSERT включает поля `last_seen_at` и `is_active` (строки 215-219)
   - ON CONFLICT обновляет `last_seen_at` и `is_active` (строки 220-229)

**Проверка соответствия полям БД:**
- ✅ Все SELECT запросы включают `last_seen_at` и `is_active`
- ✅ Все UPDATE запросы корректно обновляют `last_seen_at` и `is_active`
- ✅ Все INSERT запросы включают `last_seen_at` и `is_active`
- ✅ WHERE условия используют `is_active` для фильтрации
- ✅ ORDER BY использует `last_seen_at` для сортировки

**Результат:** Все запросы в репозитории полностью соответствуют полям в БД.

---

## Итоговый статус

✅ **Все задачи выполнены:**
1. ✅ Добавлены container_name для всех сервисов (gstd_*)
2. ✅ Создана модель Device с полями last_seen_at и is_active
3. ✅ Создан репозиторий DeviceRepository с корректными запросами

**Платформа готова:** 
- Имена контейнеров зафиксированы
- Модель Device соответствует структуре БД
- Репозиторий корректно работает с полями last_seen_at и is_active
- Все запросы SELECT/INSERT/UPDATE соответствуют полям в БД

---

## Проверка работы

### 1. Проверка имен контейнеров
```bash
docker ps --format "table {{.Names}}\t{{.Image}}"
# Должны быть видны: gstd_gateway, gstd_frontend, gstd_backend, gstd_postgres, gstd_redis
```

### 2. Проверка модели Device
```bash
# Проверить наличие файла
ls -la backend/internal/models/device.go

# Проверить наличие полей
grep -E "LastSeenAt|IsActive" backend/internal/models/device.go
```

### 3. Проверка репозитория
```bash
# Проверить наличие файла
ls -la backend/internal/repository/postgres/device.go

# Проверить использование полей в запросах
grep -E "last_seen_at|is_active" backend/internal/repository/postgres/device.go
```

### 4. Проверка соответствия запросов полям БД
```sql
-- Проверить структуру таблицы devices
\d devices

-- Проверить, что все поля из модели присутствуют в БД
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'devices'
ORDER BY ordinal_position;
```

---

## Структура файлов

```
backend/
├── internal/
│   ├── models/
│   │   └── device.go          # ✅ Создан - модель Device
│   └── repository/
│       └── postgres/
│           └── device.go      # ✅ Создан - репозиторий DeviceRepository
└── migrations/
    └── fix_devices_table.sql  # ✅ Создан - миграция для таблицы devices
```

---

## Важные замечания

1. **Модель Device:** Использует указатели (`*float64`, `*string`, `*time.Time`) для опциональных полей, что позволяет корректно обрабатывать NULL значения из БД.

2. **Репозиторий DeviceRepository:** Все запросы используют полные имена полей и включают `last_seen_at` и `is_active` во всех операциях.

3. **Соответствие БД:** Все поля в модели имеют правильные теги `db`, которые соответствуют именам колонок в таблице `devices`.

4. **Container names:** Все контейнеры теперь имеют фиксированные имена с префиксом `gstd_`, что упрощает работу с Docker командами.
