# 🚨 Quick Fixes - Критические исправления

**Дата:** 11 января 2026  
**Приоритет:** 🔴 КРИТИЧНО

---

## Проблема #1: Неправильное имя БД

**Ошибка:**
```
pq: relation "payout_transactions" does not exist
pq: relation "failed_payouts" does not exist
```

**Причина:** Backend ожидает БД `distributed_computing`, но используется `postgres`.

**Решение:**
```bash
# Вариант 1: Создать БД distributed_computing
docker exec ubuntu_postgres_1 psql -U postgres -c "CREATE DATABASE distributed_computing;"

# Вариант 2: Изменить конфигурацию backend
# Добавить в docker-compose.yml:
environment:
  - DB_NAME=postgres
```

---

## Проблема #2: Отсутствующие таблицы

**Решение:**
```bash
# Применить миграции
POSTGRES_CONTAINER=$(docker ps --format "{{.Names}}" | grep postgres | head -1)
docker exec -i $POSTGRES_CONTAINER psql -U postgres -d postgres < backend/migrations/v10_failed_payouts.sql
docker exec -i $POSTGRES_CONTAINER psql -U postgres -d postgres < backend/migrations/v15_payout_tracking.sql
```

---

## Проблема #3: Отсутствующая колонка certainty_gravity_score

**Ошибка:**
```
pq: column "certainty_gravity_score" does not exist
```

**Решение:**
```sql
-- Добавить колонку или использовать priority_score
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS certainty_gravity_score NUMERIC(10,6);
-- Или изменить запрос в task_service.go:202 на priority_score
```

---

## Проблема #4: Gateway Timeout

**Решение:**
- Проверить доступность backend: `curl http://127.0.0.1:8080/api/v1/health`
- Исправить gateway.conf: добавить resolver и таймауты

---

## Проблема #5: Несоответствие моделей Task

**Решение:**
Расширить TypeScript интерфейс в `TasksPanel.tsx`:
```typescript
interface Task {
  task_id: string;
  task_type: string;
  status: string;
  labor_compensation_ton: number;
  created_at: string;
  completed_at?: string;
  assigned_device?: string;
  // Добавить недостающие поля:
  operation?: string;
  model?: string;
  priority_score?: number;
  escrow_status?: string;
  confidence_depth?: number;
}
```
