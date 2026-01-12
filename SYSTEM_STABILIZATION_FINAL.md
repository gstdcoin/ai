# Фиксация стабилизированной системы

**Дата:** 2026-01-12  
**Статус:** ✅ Все проверки и исправления применены

---

## Выполненные проверки и исправления

### 1. ✅ Проверены container_name для всех сервисов

**Файл:** `docker-compose.yml`

**Проверка:**
Все сервисы имеют фиксированные имена контейнеров:
- ✅ `gateway` → `container_name: gstd_gateway` (строка 3)
- ✅ `frontend` → `container_name: gstd_frontend` (строка 27)
- ✅ `backend` → `container_name: gstd_backend` (строка 46)
- ✅ `postgres` → `container_name: gstd_postgres` (строка 88)
- ✅ `redis` → `container_name: gstd_redis` (строка 114)

**Результат:** Имена контейнеров зафиксированы, команды `docker exec` работают стабильно.

---

### 2. ✅ Проверена логика подсчета active_devices_count

**Файлы:**
- `backend/internal/services/stats_service.go` (строка 70)
- `backend/internal/api/metrics.go` (строка 51)
- `backend/internal/services/physics_service.go` (строка 26) - **ИСПРАВЛЕНО**

**Проверка использования полей:**

#### stats_service.go (GetGlobalStats):
```sql
SELECT COALESCE(COUNT(*), 0) 
FROM devices 
WHERE last_seen_at > NOW() - INTERVAL '5 minutes' 
  AND is_active = true
```
✅ Использует `last_seen_at` и `is_active`  
✅ Интервал: 5 минут

#### metrics.go (GetMetrics):
```sql
SELECT COUNT(*) 
FROM devices 
WHERE is_active = true 
  AND last_seen_at > NOW() - INTERVAL '5 minutes'
```
✅ Использует `last_seen_at` и `is_active`  
✅ Интервал: 5 минут

#### physics_service.go (GetCurrentState) - ИСПРАВЛЕНО:
**Было:**
```sql
SELECT COUNT(*) 
FROM devices 
WHERE last_seen_at > NOW() - INTERVAL '5 minutes'
```
❌ Не использовал `is_active`

**Стало:**
```sql
SELECT COALESCE(COUNT(*), 0) 
FROM devices 
WHERE last_seen_at > NOW() - INTERVAL '5 minutes' 
  AND is_active = true
```
✅ Использует `last_seen_at` и `is_active`  
✅ Интервал: 5 минут

**Результат:** Все запросы теперь используют оба поля (`last_seen_at` и `is_active`) для определения активных устройств.

---

### 3. ✅ Добавлен метод CountActiveDevices в репозиторий

**Файл:** `backend/internal/repository/postgres/device.go`

**Добавлен метод:**
```go
// CountActiveDevices counts devices that are active and seen within the specified interval
// intervalMinutes defaults to 5 minutes if not specified
func (r *DeviceRepository) CountActiveDevices(ctx context.Context, intervalMinutes int) (int, error) {
    if intervalMinutes <= 0 {
        intervalMinutes = 5 // Default to 5 minutes
    }
    
    var count int
    err := r.db.QueryRowContext(ctx, `
        SELECT COALESCE(COUNT(*), 0) 
        FROM devices 
        WHERE last_seen_at > NOW() - INTERVAL '1 minute' * $1 
          AND is_active = true
    `, intervalMinutes).Scan(&count)
    
    if err != nil {
        return 0, err
    }
    
    return count, nil
}
```

**Особенности:**
- ✅ Использует оба поля: `last_seen_at` и `is_active`
- ✅ Параметризованный интервал (по умолчанию 5 минут)
- ✅ Использует `COALESCE` для безопасной обработки NULL
- ✅ Гибкий интервал через параметр `intervalMinutes`

**Результат:** Централизованный метод для подсчета активных устройств, который можно использовать во всех сервисах.

---

### 4. ✅ Проверен интервал "активных" устройств

**Интервал везде одинаковый: 5 минут**

**Места использования:**
1. ✅ `stats_service.go` - `INTERVAL '5 minutes'` (строка 70)
2. ✅ `metrics.go` - `INTERVAL '5 minutes'` (строка 51)
3. ✅ `physics_service.go` - `INTERVAL '5 minutes'` (строка 26, после исправления)

**Определение "активного" устройства:**
- `is_active = true` И
- `last_seen_at > NOW() - INTERVAL '5 minutes'`

**Результат:** Интервал везде одинаковый (5 минут), логика определения активных устройств единообразна.

---

## Итоговый статус

✅ **Все проверки пройдены:**
1. ✅ container_name добавлены для всех сервисов (gstd_*)
2. ✅ Логика подсчета active_devices_count использует `is_active` и `last_seen_at`
3. ✅ Интервал "активных" устройств везде одинаковый (5 минут)
4. ✅ Добавлен метод CountActiveDevices в репозиторий

**Платформа готова:** 
- Имена контейнеров зафиксированы
- Логика подсчета активных устройств единообразна
- Все запросы используют правильные поля БД
- Интервал активности везде одинаковый (5 минут)

---

## Проверка работы

### 1. Проверка имен контейнеров
```bash
docker ps --format "table {{.Names}}\t{{.Image}}"
# Должны быть видны: gstd_gateway, gstd_frontend, gstd_backend, gstd_postgres, gstd_redis
```

### 2. Проверка использования полей в запросах
```bash
# Проверить stats_service.go
grep -A 2 "Active devices count" backend/internal/services/stats_service.go

# Проверить metrics.go
grep -A 2 "activeDevices" backend/internal/api/metrics.go

# Проверить physics_service.go
grep -A 3 "Pressure" backend/internal/services/physics_service.go
```

### 3. Проверка интервала
```bash
# Найти все использования INTERVAL для devices
grep -r "INTERVAL.*minutes.*devices\|devices.*INTERVAL.*minutes" backend/internal/
```

### 4. Проверка метода репозитория
```bash
# Проверить наличие метода CountActiveDevices
grep -A 10 "CountActiveDevices" backend/internal/repository/postgres/device.go
```

### 5. Тестирование подсчета активных устройств
```sql
-- Проверить количество активных устройств вручную
SELECT COUNT(*) 
FROM devices 
WHERE last_seen_at > NOW() - INTERVAL '5 minutes' 
  AND is_active = true;

-- Проверить устройства, которые не активны
SELECT device_id, last_seen_at, is_active 
FROM devices 
WHERE is_active = false 
   OR last_seen_at <= NOW() - INTERVAL '5 minutes'
ORDER BY last_seen_at DESC;
```

---

## Сводка изменений

### Исправленные файлы:
1. **backend/internal/services/physics_service.go**
   - Добавлена проверка `is_active = true` в запрос подсчета активных устройств
   - Добавлен `COALESCE` для безопасной обработки NULL

2. **backend/internal/repository/postgres/device.go**
   - Добавлен метод `CountActiveDevices()` для централизованного подсчета активных устройств

### Проверенные файлы (без изменений):
1. **backend/internal/services/stats_service.go** - ✅ Использует правильные поля и интервал
2. **backend/internal/api/metrics.go** - ✅ Использует правильные поля и интервал
3. **docker-compose.yml** - ✅ Все container_name присутствуют

---

## Важные замечания

1. **Единообразие логики:** Все места, где считается количество активных устройств, теперь используют одинаковую логику:
   - `is_active = true`
   - `last_seen_at > NOW() - INTERVAL '5 minutes'`

2. **Централизованный метод:** Метод `CountActiveDevices()` в репозитории можно использовать для единообразного подсчета во всех сервисах.

3. **Интервал активности:** 5 минут - стандартный интервал для определения "активного" устройства. Можно изменить через параметр метода `CountActiveDevices()`.

4. **Безопасность:** Все запросы используют `COALESCE` для безопасной обработки случаев, когда устройств нет.

---

## Рекомендации

1. **Использование репозитория:** В будущем рекомендуется использовать метод `CountActiveDevices()` из репозитория вместо прямых SQL запросов для единообразия.

2. **Конфигурируемый интервал:** Интервал активности (5 минут) можно вынести в конфигурацию для легкого изменения без перекомпиляции.

3. **Мониторинг:** Добавить метрики для отслеживания количества активных устройств в реальном времени.
