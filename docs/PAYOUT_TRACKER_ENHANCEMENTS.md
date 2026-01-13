# PaymentTracker Enhancements

**Дата:** 2026-01-13  
**Статус:** ✅ Реализовано

---

## 📋 Выполненные задачи

### 1. ✅ Логирование успешных транзакций в `payout_history`

**Миграция:** `backend/migrations/v23_payout_history.sql`

Создана таблица `payout_history` для логирования всех успешных транзакций выплат:

```sql
CREATE TABLE payout_history (
    id SERIAL PRIMARY KEY,
    payout_transaction_id INTEGER NOT NULL,
    task_id UUID NOT NULL,
    executor_address VARCHAR(255) NOT NULL,
    tx_hash VARCHAR(255) NOT NULL,
    query_id BIGINT,
    executor_reward_ton DECIMAL(20, 9) NOT NULL,
    platform_fee_ton DECIMAL(20, 9) NOT NULL,
    nonce BIGINT NOT NULL,
    confirmed_at TIMESTAMP NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    ...
);
```

**Логика:**
- При подтверждении транзакции в `markTransactionConfirmed()` автоматически создается запись в `payout_history`
- Сохраняются все детали транзакции: hash, reward, fee, nonce, query_id
- Используется для аудита и аналитики

---

### 2. ✅ Автоматическая проверка зависших транзакций (24 часа)

**Изменения:**
- Таймаут увеличен с **20 минут** до **24 часов**
- Проверка выполняется каждые 2 минуты (как и раньше)
- Если транзакция в статусе `pending` или `sent` более 24 часов, она помечается как `failed`

**Логика:**
```go
// Check if transaction is older than 24 hours
if time.Since(dbTx.CreatedAt) > 24*time.Hour {
    // Mark as failed and refund balance
    pt.markTransactionFailedAndRefund(ctx, dbTx.ID, dbTx.TaskID, dbTx.ExecutorAddr, dbTx.ExecutorReward)
}
```

---

### 3. ✅ Возврат баланса пользователю при зависании

**Метод:** `markTransactionFailedAndRefund()`

При зависании транзакции более 24 часов:

1. **Транзакция помечается как `failed`:**
   ```sql
   UPDATE payout_transactions
   SET status = 'failed', failed_at = NOW(),
       error_message = 'Transaction stuck in TON network for more than 24 hours - refunded to user balance'
   WHERE id = $1
   ```

2. **Статус задачи обновляется:**
   ```sql
   UPDATE tasks
   SET executor_payout_status = 'failed'
   WHERE task_id = $1
   ```

3. **Баланс возвращается пользователю:**
   ```sql
   UPDATE users
   SET balance = COALESCE(balance, 0) + $1,
       updated_at = NOW()
   WHERE wallet_address = $2 OR address = $2
   ```

**Результат:**
- Пользователь может повторно запросить выплату из личного кабинета
- Баланс доступен для новых выплат
- Транзакция помечена как failed для аудита

---

## 🔧 Технические детали

### Обновленные методы

1. **`reconcilePayments()`:**
   - Теперь получает `executor_reward_ton`, `platform_fee_ton`, `nonce` из БД
   - Проверяет таймаут 24 часа вместо 20 минут
   - Вызывает `markTransactionFailedAndRefund()` для зависших транзакций

2. **`markTransactionConfirmed()`:**
   - Добавлены параметры: `executorReward`, `platformFee`, `nonce`, `queryID`
   - Автоматически логирует успешную транзакцию в `payout_history`
   - Все вызовы обновлены для передачи новых параметров

3. **`markTransactionFailedAndRefund()` (новый):**
   - Помечает транзакцию как failed
   - Возвращает баланс пользователю
   - Обновляет статус задачи

---

## 📊 Структура данных

### payout_history

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | SERIAL | Primary key |
| `payout_transaction_id` | INTEGER | FK to `payout_transactions` |
| `task_id` | UUID | FK to `tasks` |
| `executor_address` | VARCHAR(255) | Адрес исполнителя |
| `tx_hash` | VARCHAR(255) | Hash транзакции в TON |
| `query_id` | BIGINT | Query ID транзакции |
| `executor_reward_ton` | DECIMAL(20,9) | Награда исполнителя |
| `platform_fee_ton` | DECIMAL(20,9) | Комиссия платформы |
| `nonce` | BIGINT | Nonce транзакции |
| `confirmed_at` | TIMESTAMP | Время подтверждения |
| `created_at` | TIMESTAMP | Время создания записи |

---

## 🚀 Применение изменений

### 1. Применить миграцию:

```bash
docker exec -i gstd_postgres psql -U postgres -d distributed_computing < backend/migrations/v23_payout_history.sql
```

### 2. Пересобрать backend:

```bash
docker-compose build backend
docker-compose restart backend
```

---

## ✅ Проверка работы

### 1. Проверить таблицу payout_history:

```sql
SELECT * FROM payout_history ORDER BY confirmed_at DESC LIMIT 10;
```

### 2. Проверить зависшие транзакции:

```sql
SELECT id, task_id, executor_address, status, created_at,
       EXTRACT(EPOCH FROM (NOW() - created_at))/3600 as hours_old
FROM payout_transactions
WHERE status IN ('pending', 'sent')
ORDER BY created_at ASC;
```

### 3. Проверить возврат баланса:

```sql
-- До обработки
SELECT wallet_address, balance FROM users WHERE wallet_address = 'USER_ADDRESS';

-- После обработки (должен увеличиться на executor_reward_ton)
SELECT wallet_address, balance FROM users WHERE wallet_address = 'USER_ADDRESS';
```

---

## 📝 Логи

PaymentTracker теперь логирует:

- ✅ Успешные транзакции в `payout_history`
- ⚠️ Зависшие транзакции (более 24 часов)
- 💰 Возврат баланса пользователю
- 📊 Статистику обработки транзакций

**Пример логов:**
```
PaymentTracker: Transaction 123 (task: abc-123) timed out after 24 hours, marking as failed and refunding balance
PaymentTracker: Refunded 0.500000000 TON to user EQxxx... for failed transaction 123
PaymentTracker: Successfully logged transaction 456 to payout_history
```

---

## 🔒 Безопасность

- Все операции выполняются в транзакциях БД
- Откат при ошибках
- Логирование всех операций
- Аудит через `payout_history`

---

**Обновлено:** 2026-01-13  
**Статус:** ✅ Готово к применению
