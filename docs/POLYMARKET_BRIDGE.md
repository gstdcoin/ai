# Polymarket Bridge — события в задачи

**Дата:** 2026-02-14  
**Цель:** Разделить доступные токены на задачи, создать ~100 событий, критерии результата, награды, анализ, выплаты, комиссия 70% золото / 30% фонд.

---

## Архитектура

1. **Polymarket → задачи** — события с Gamma API превращаются в задачи типа `polymarket_prediction`.
2. **Критерии результата** — воркер отправляет `{prediction: "yes"|"no", confidence: 0-1, reasoning: "..."}`.
3. **Награда** — 0.5 GSTD за результат (настраивается), до 5 воркеров на задачу.
4. **Агрегация** — после ≥3 результатов вычисляется консенсус (взвешенный по confidence).
5. **Выплата** — при завершении задачи воркер получает награду на баланс; комиссия 15% → 70% gold_reserve, 30% dev_fund.

---

## API

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/api/v1/polymarket/bridge/tasks` | Список bridge-задач (status, limit) |
| GET | `/api/v1/polymarket/bridge/pool` | Баланс polymarket_pool |
| POST | `/api/v1/polymarket/bridge/fetch` | Загрузить события и создать задачи (limit=100) |
| POST | `/api/v1/polymarket/bridge/tasks/:task_id/aggregate` | Агрегировать результаты и пометить analyzed |
| POST | `/api/v1/polymarket/bridge/fund` | Пополнить pool (body: `{amount_gstd, source}`) |

---

## Флоу воркера

1. **Задачи** — `/api/v1/marketplace/tasks` возвращает задачи `polymarket_prediction`.
2. **Claim** — `POST /api/v1/marketplace/tasks/:id/claim` (staking).
3. **Complete** — `POST /api/v1/marketplace/tasks/:id/complete` с body:
   ```json
   {
     "execution_time_ms": 5000,
     "quality_score": 0.9,
     "result_data": {
       "prediction": "yes",
       "confidence": 0.85,
       "reasoning": "Based on recent polls..."
     }
   }
   ```
4. **Выплата** — автоматически после CompleteTask (escrow → 80% воркер, 15% platform, 5% referral; platform split 70% gold / 30% dev).

---

## Миграция

```bash
psql -f backend/migrations/v53_polymarket_bridge.sql
```

---

## Конфигурация

- `POLYMARKET_POOL_GSTD` — начальный баланс pool (через `/fund` или миграцию).
- `NET_REVENUE_TO_GOLD_PCT` — 70% комиссии → gold_reserve (по умолчанию).

---

## Telegram Bot — приём и выполнение задач

**Эндпоинты (X-Bot-Token):**
- `POST /api/v1/telegram/bot/link` — привязать wallet к telegram_id
- `GET /api/v1/telegram/bot/wallet?telegram_id=X` — получить wallet
- `POST /api/v1/telegram/bot/claim` — claim задачи
- `POST /api/v1/telegram/bot/complete` — отправить результат

**Команды бота:**
- `/connect <wallet>` — привязать кошелёк
- `/take <task_id>` — взять задачу (нужен баланс для stake)
- `/complete <task_id> yes 0.85 "reasoning"` — Polymarket
- `/complete <task_id>` — обычная задача

**Конфигурация:** `BOT_API_KEY` (или `TELEGRAM_BOT_TOKEN`) — один и тот же на backend и боте.
