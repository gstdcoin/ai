# API Consistency Audit — Telegram Bot vs Agents vs Platform

Проверка согласованности API: Telegram бот, агенты (A2A), общая реализация платформы.

---

## 1. Два разных потока задач (критично)

### Marketplace flow (Telegram, Dashboard)
| Этап | Endpoint | Сервис |
|------|----------|--------|
| Список задач | `GET /marketplace/tasks` | marketplace.GetAvailableTasks |
| Claim | `POST /telegram/bot/claim` | marketplace.ClaimTask |
| Complete | `POST /telegram/bot/complete` | marketplace.CompleteTask |

**Особенности:**
- Требует **stake** (списание с balance при claim)
- Использует `worker_task_assignments`
- Использует `task_escrow` — payout через escrow
- Фильтр: `task_escrow.status IN (NULL, 'locked')`, `max_workers`, `workers_completed`

### Assignment flow (агенты, connect_autonomous)
| Этап | Endpoint | Сервис |
|------|----------|--------|
| Список задач | `GET /tasks/pending` | assignment.GetAvailableTasks |
| Claim | `POST /device/tasks/:id/claim` | assignment.ClaimTask |
| Complete | `POST /device/tasks/:id/result` | resultService.SubmitResult |

**Особенности:**
- **Без stake**
- Использует только `assigned_device` в tasks
- Payout через ResultService.ProcessPayment (gstd_balance, gstd_escrow_balance)
- Фильтр: `status IN ('pending','queued','timeout')` — **без проверки task_escrow**

### Противоречие
- Оба потока работают с одной таблицей `tasks`
- Assignment возвращает задачи, у которых может быть task_escrow (marketplace)
- Marketplace возвращает только задачи с escrow
- **Риск:** агент может claim задачу marketplace → ResultService выплатит из gstd_escrow, но escrow service тоже может попытаться release → двойная выплата или конфликт
- **Риск:** агент claim → assignment обновляет assigned_device. Telegram потом не сможет claim (status уже assigned). Но Telegram использует marketplace — который создаёт worker_task_assignments. Если агент первый, marketplace.ClaimTask увидит status=assigned и не пройдёт (проверка status pending/queued). OK.
- **Обратно:** Telegram claim первым → marketplace создаёт worker_task_assignments, обновляет assigned_device. Агент потом claim → assignment.ClaimTask увидит status=assigned → "task already assigned". OK.

Вывод: первый claim выигрывает. Но **источники задач разные** — откуда Telegram берёт task_id для /take?

---

## 2. Откуда Telegram получает task_id?

Telegram: `/take <task_id>` — пользователь вводит вручную. Нет endpoint для списка задач в боте.

- `GET /marketplace/tasks` — требует session (wallet). Бот вызывает внутренние /telegram/bot/*, не marketplace напрямую.
- Бот не показывает список задач — пользователь должен знать task_id извне.

**Противоречие:** UX — как пользователь Telegram узнаёт task_id? Документация не описывает.

---

## 3. Баланс — разные форматы и баг

### Telegram: `GET /api/v1/telegram/bot/balance?telegram_id=N`
```json
{"linked": true, "wallet": "EQ...", "balance_gstd": 1.5, "pending_gstd": 0.2}
```
- Источник: `balance + gstd_balance`, `pending_balance_gstd` из users

### Agent: `GET /api/v1/users/balance`
```json
{"ton": 0.5, "gstd_on_chain": 1.0, "gstd": 1.5, "balance_internal": 0.5}
```
- **Баг:** использует `c.GetString("user_id")` — при API key auth устанавливается только `wallet_address`!
- Агенты получают **401 Unauthorized** на /users/balance

### Документация (AGENT_GUIDE)
- Указано: "Баланс: GET /api/v1/users/balance" — но для агентов не работает.

**Исправление:** getUserBalance должен fallback на `wallet_address` когда `user_id` пустой.

---

## 4. claim_balance / withdraw

### Документация
- AGENT_GUIDE: `POST /api/v1/users/claim_balance` (min 0.1 GSTD)
- A2A SKILL: min 0.1 GSTD

### Реализация
- `getPendingBalance`: min 10.0 в message ("Earn 10 GSTD to claim")
- `claimPendingBalance`: проверка `balance >= 10.0` — **отклоняет при < 10**

**Противоречие:** Документация говорит min 0.1, код требует 10.0.

---

## 5. Wallet resolution для агентов (ResultService)

Agent claim использует `device_id = "autonomous-" + WALLET[:8]` (например `autonomous-EQ12345678`).

ResultService.ProcessPayment:
1. Ищет `wallet_address` в `nodes` по `id = assigned_device` — нет (id обычно wallet)
2. Ищет в `devices` по `device_id` — device "autonomous-EQ12345678" не регистрируется при handshake (handshake создаёт "a2a-{uuid}" если device_id не передан)

**Итог:** workerWallet = "" → награда **не зачисляется** агенту.

**Исправление:** ResultService должен использовать assigned_device как wallet, когда он похож на TON-адрес (EQ/UQ, 48+ символов), или когда device_id имеет префикс "autonomous-" — извлекать wallet из devices/nodes или парсить.

---

## 6. Единая таблица users — поля баланса

| Поле | Использование |
|------|---------------|
| balance | Marketplace stake, internal ledger |
| gstd_balance | On-chain + earned (ResultService credit) |
| pending_balance_gstd | Gasless mining, claim_balance |
| gstd_escrow_balance | Creator escrow (ResultService deduct) |
| gstd_frozen | Stake (ResultService release) |

Telegram balance: `balance + gstd_balance`, `pending_gstd` = pending_balance_gstd.
Agent balance (если починить): должен показывать то же.

---

## 7. Рекомендации

| # | Проблема | Действие |
|---|----------|----------|
| 1 | getUserBalance 401 для агентов | Fallback: `wallet_address` если `user_id` пустой |
| 2 | claim_balance min 10 vs doc 0.1 | Унифицировать: либо 0.1 в коде, либо обновить доки |
| 3 | ResultService не находит wallet для autonomous-* | Использовать assigned_device как wallet при EQ/UQ/48+ или парсить autonomous- |
| 4 | Два потока задач | Чётко разделить: marketplace (escrow, stake) vs assignment (простые задачи). Или фильтровать GET /tasks/pending: исключать задачи с task_escrow. |
| 5 | Telegram task list | Добавить `GET /telegram/bot/tasks?telegram_id=N` для списка доступных задач |

---

## 8. Сводка совместимости

| Компонент | Auth | Balance | Tasks | Claim/Complete |
|-----------|------|---------|-------|----------------|
| Telegram | X-Bot-Token | /telegram/bot/balance | Нет списка | marketplace |
| Agent | API Key | /users/balance (401) | /tasks/pending | assignment + result |
| Dashboard | Session | /users/balance | /marketplace/tasks | marketplace |

После исправлений агенты и Telegram будут использовать согласованные данные из users.
