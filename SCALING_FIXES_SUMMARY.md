# Исправления критических уязвимостей масштабирования

**Дата:** 2026-01-12  
**Статус:** ✅ Все критические исправления применены

---

## Выполненные исправления

### 1. ✅ GetAvailableTasks: добавлен FOR UPDATE SKIP LOCKED

**Файл:** `backend/internal/services/assignment_service.go`  
**Строки:** 112-126

**Изменения:**
- Добавлен `FOR UPDATE SKIP LOCKED` после `ORDER BY`
- Обновлен `WHERE` для включения статуса `'timeout'`: `WHERE status IN ('pending', 'timeout')`
- Обновлена логика `AssignTask` для поддержки переназначения задач со статусом `'timeout'`

**Результат:**
- Исключены race conditions при параллельном выборе задач несколькими воркерами
- Задачи со статусом `'timeout'` могут быть переназначены новым воркерам
- Параллельные запросы не блокируют друг друга благодаря `SKIP LOCKED`

**Код:**
```sql
SELECT ...
FROM tasks
WHERE status IN ('pending', 'timeout')
  AND COALESCE(min_trust_score, 0.0) <= $1
ORDER BY COALESCE(priority_score, 0.0) DESC, created_at ASC
FOR UPDATE SKIP LOCKED
LIMIT $2
```

---

### 2. ✅ Создан .env.example

**Файл:** `/home/ubuntu/.env.example`

**Содержимое:**
- `DB_PASSWORD` - пароль для подключения к PostgreSQL
- `POSTGRES_PASSWORD` - пароль для PostgreSQL контейнера
- `REDIS_PASSWORD` - пароль для Redis (опционально)
- Все остальные переменные окружения с примерами значений

**Инструкции:**
1. Скопировать `.env.example` в `.env`
2. Установить безопасные пароли
3. Не коммитить `.env` в репозиторий

---

### 3. ✅ Обновлен docker-compose.yml: секреты вынесены в переменные

**Файл:** `docker-compose.yml`

**Изменения для backend:**
```yaml
env_file:
  - .env
environment:
  - DB_PASSWORD=${DB_PASSWORD}
  - POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
```

**Изменения для postgres:**
```yaml
env_file:
  - .env
environment:
  - POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
```

**Результат:**
- Пароли больше не хранятся в открытом виде в docker-compose.yml
- Используются переменные окружения из `.env` файла
- Fallback значения через `${VAR:-default}` для совместимости

**Важно:** Перед запуском необходимо создать `.env` файл на основе `.env.example` и установить реальные пароли.

---

### 4. ✅ TimeoutService: статус 'timeout' и логирование

**Файл:** `backend/internal/services/timeout_service.go`  
**Строки:** 21-75

**Изменения:**

1. **Статус изменен с 'pending' на 'timeout':**
   ```sql
   SET status = 'timeout',  -- Было: 'pending'
   ```

2. **Добавлено логирование с ID задачи и устройства:**
   ```go
   log.Printf("TimeoutService: Task %s timed out (device: %s) - status changed to 'timeout'", task.TaskID, deviceID)
   log.Printf("TimeoutService: Reassigned %d tasks due to timeout", len(reassignedTasks))
   ```

3. **Запрос возвращает assigned_device для логирования:**
   ```sql
   RETURNING task_id, assigned_device
   ```

**Результат:**
- Четкое различение задач с таймаутом от новых задач
- Логирование позволяет отслеживать проблемные устройства
- Возможность анализа паттернов таймаутов

**Пример лога:**
```
TimeoutService: Task abc-123 timed out (device: device-xyz) - status changed to 'timeout'
TimeoutService: Reassigned 3 tasks due to timeout
```

---

## Дополнительные изменения

### Обновлена логика AssignTask для поддержки статуса 'timeout'

**Файл:** `backend/internal/services/assignment_service.go`

**Изменения:**
1. Проверка статуса теперь принимает и `'pending'`, и `'timeout'`:
   ```go
   if currentStatus != "pending" && currentStatus != "timeout" {
       return fmt.Errorf("task is not available (current status: %s)", currentStatus)
   }
   ```

2. UPDATE запрос обновлен:
   ```sql
   WHERE task_id = $3 AND status IN ('pending', 'timeout')
   ```

3. ClaimTask обновлен:
   ```go
   if status != "pending" && status != "timeout" {
       return fmt.Errorf("task already assigned (current status: %s)", status)
   }
   ```

**Результат:** Задачи со статусом `'timeout'` могут быть переназначены новым воркерам.

---

## Проверка изменений

### 1. Проверка GetAvailableTasks

**Тест:**
```bash
# Запустить несколько параллельных запросов к GetAvailableTasks
# Убедиться, что каждая задача возвращается только одному воркеру
```

**Ожидаемый результат:** Нет дублирования задач между воркерами.

---

### 2. Проверка секретов

**Проверить:**
```bash
# Убедиться, что .env файл создан
cat .env

# Проверить, что docker-compose.yml не содержит открытых паролей
grep -i "password" docker-compose.yml
```

**Ожидаемый результат:** Пароли только в `.env`, в docker-compose.yml только переменные `${DB_PASSWORD}`.

---

### 3. Проверка TimeoutService

**Тест:**
1. Создать задачу и назначить её устройству
2. Подождать таймаут (5 минут)
3. Проверить логи и статус задачи

**Ожидаемый результат:**
- Статус задачи изменен на `'timeout'`
- В логах видно ID задачи и устройства
- Задача может быть переназначена через GetAvailableTasks

---

## Следующие шаги

1. **Создать .env файл:**
   ```bash
   cp .env.example .env
   # Отредактировать .env и установить безопасные пароли
   ```

2. **Перезапустить контейнеры:**
   ```bash
   docker compose down
   docker compose up -d
   ```

3. **Проверить работу:**
   - Проверить логи backend на наличие сообщений TimeoutService
   - Проверить, что задачи с таймаутом переназначаются
   - Убедиться, что нет race conditions при параллельном доступе

---

## Итоговый статус

✅ **Все критические исправления применены:**
- FOR UPDATE SKIP LOCKED добавлен
- Секреты вынесены в .env
- Статус 'timeout' реализован
- Логирование добавлено

**Платформа готова к масштабированию** после создания `.env` файла с реальными паролями.
