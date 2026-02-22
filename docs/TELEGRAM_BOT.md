# GSTD Telegram Bot — Команды и локализация

Бот поддерживает команды для работы с GSTD токенами. Локализация: **RU** и **EN** (по `language_code` пользователя).

---

## Команды

| Команда | Описание | RU | EN |
|---------|-----------|----|----|
| `/connect <wallet>` | Привязать TON-кошелёк | ✅ | ✅ |
| `/ai <prompt>` | AI inference (~0.01 GSTD) | ✅ | ✅ |
| `/buy` | Ссылки Ston.fi, DeDust | ✅ | ✅ |
| `/withdraw` | Вывод GSTD (min 0.1) | ✅ | ✅ |
| `/balance` | Баланс GSTD | ✅ | ✅ |
| `/take <task_id>` | Взять задачу | ✅ | ✅ |
| `/complete <task_id>` | Завершить задачу | ✅ | ✅ |
| `/buy` или `/buy N` | Купить GSTD за Stars (без кошелька) | ✅ | ✅ |
| `💎 My Balance` | Баланс (кнопка) | ✅ | ✅ |
| `🚀 My Nodes` | Список нод | ✅ | ✅ |

---

## API endpoints (X-Bot-Token)

| Endpoint | Метод | Описание |
|----------|-------|----------|
| `/api/v1/telegram/bot/link` | POST | Привязать кошелёк |
| `/api/v1/telegram/bot/balance` | GET | Баланс по telegram_id |
| `/api/v1/telegram/bot/nodes` | GET | Ноды по telegram_id |
| `/api/v1/telegram/bot/claim` | POST | Взять задачу |
| `/api/v1/telegram/bot/complete` | POST | Завершить задачу |
| `/api/v1/telegram/bot/ai` | POST | AI inference (telegram_id, prompt, lang) |

---

## /ai — AI за GSTD

- Требуется привязанный кошелёк (`/connect`)
- Минимум ~0.005 GSTD на балансе
- Стоимость: ~0.01 GSTD за запрос (7b модель)
- Вызов gateway: `POST /api/v1/chat/completions` с `X-GSTD-Target-Wallet`

---

## Локализация

Файл: `backend/internal/services/telegram_bot_i18n.go`

Ключи: `ai_wallet_not_linked`, `ai_insufficient_balance`, `ai_error`, `ai_cost`, `ai_usage`, `buy_title`, `withdraw_title`, `withdraw_wallet_not_linked`, `withdraw_insufficient`, `withdraw_btn`, `connect_success`, `balance_not_linked`, `balance_format`.

---

## Покупка GSTD за Stars

Без кошелька. Пользователь может купить GSTD прямо в Telegram:

- `/buy` — счёт на 10 Stars
- `/buy 50` — счёт на 50 Stars
- Кнопка «⭐ 10 Stars» в меню

При оплате GSTD зачисляется мгновенно. Если кошелёк не привязан — создаётся виртуальный `tg-{id}`. При `/connect` баланс переносится на реальный кошелёк.

Подробнее: [docs/STARS_PURCHASE.md](STARS_PURCHASE.md)

## Проверка

```bash
# С X-Bot-Token (значение = TELEGRAM_BOT_TOKEN или BOT_API_KEY)
curl -X POST https://app.gstdtoken.com/api/v1/telegram/bot/ai \
  -H "Content-Type: application/json" \
  -H "X-Bot-Token: YOUR_BOT_TOKEN" \
  -d '{"telegram_id":123,"prompt":"Hello","lang":"en"}'
```
