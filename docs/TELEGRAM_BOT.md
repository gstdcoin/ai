# GSTD Telegram Bot — Команды

Бот реализован как единый Vercel-вебхук: [`frontend/src/pages/api/v1/telegram/webhook.ts`](../frontend/src/pages/api/v1/telegram/webhook.ts).
Токен (`TELEGRAM_BOT_TOKEN`) живёт только в Vercel env vars. У Pi-ноды токена нет — она только отдаёт inference.

Локализации нет: все тексты на английском, независимо от `language_code` пользователя.

---

## Команды

| Команда | Описание |
|---------|-----------|
| `/start` | Приветствие + клавиатура (Earn / Balance / Mobile Node / Wallet / Loan / AI Chat) |
| `/wallet` | Показать привязанный кошелёк или запросить TON-адрес для привязки |
| `/balance` | Баланс GSTD, tier, pending reward |
| `/earn` | Как зарабатывать GSTD (описание тарифов ноды) |
| `/node` | Запуск мобильной ноды (кнопка запускает TMA — `app.gstdtoken.com/tma`) |
| `/loan` | Займы под залог GSTD — см. ниже |
| `/help` | Список команд |
| `/new` | Сбросить историю AI-диалога |
| Любой текст без `/` | Отправляется в AI-чат (через `callNodeChat`, роутится на живую ноду сети) |

Кнопки клавиатуры дублируют команды по тексту (`💎 Balance`, `🔗 Wallet`, `🏦 Loan`, и т.д.); `🤖 AI Chat` отвечает подсказкой "just type your question".

Привязка кошелька происходит автоматически: если сообщение — валидный TON-адрес (`EQ.../UQ.../0:...`), бот сохраняет его как `tg_wallet:{userId}` и вызывает `/api/v1/telegram/bot/link` (welcome-бонус + реферальные бонусы).

---

## Займы (`/loan`)

Текстовые команды (не слэш-команды, обычные сообщения):

| Сообщение | Действие |
|-----------|----------|
| `loan 50` | Занять под залог 50 GSTD (LTV 70% → выдаётся 35 GSTD кредита) |
| `repay all` | Погасить весь долг по самому старому активному займу |
| `repay 10` | Частично погасить 10 GSTD |

Требуется привязанный кошелёк (`/wallet`). Реализовано через `POST /api/v1/loans/create` и `POST /api/v1/loans/repay`
(бот сначала вызывает `GET /api/v1/loans/list`, чтобы найти `loan_id`).

---

## Внутренние API-эндпоинты, используемые ботом

| Endpoint | Метод | Кем вызывается |
|----------|-------|-----------------|
| `/api/v1/telegram/bot/link` | POST | webhook.ts при обнаружении TON-адреса в сообщении |
| `/api/v1/market/price` | GET | webhook.ts для курса GSTD/Stars при привязке кошелька |
| `/api/v1/loans/create`, `/repay`, `/list` | POST/GET | webhook.ts для команд `loan <n>` / `repay ...` |
| `/api/v1/chat/completions` (через `lib/nodes.ts::callNodeChat`) | — | webhook.ts для AI-чата |

Отдельные REST-эндпоинты `/api/v1/telegram/bot/balance`, `/wallet`, `/topup` существуют, но **не вызываются** из webhook.ts —
похоже, остались от более раннего варианта бота или предназначены для внешних интеграций.
`/api/v1/telegram/bot/claim_reward` используется дашбордом (`frontend/src/pages/nodes.tsx`), не самим ботом.

---

## Устарело / не существует в текущей реализации

Более ранняя версия этого документа описывала команды `/connect`, `/ai`, `/buy`, `/withdraw`, `/take`, `/complete`,
X-Bot-Token авторизацию и `backend/internal/services/telegram_bot_i18n.go`. Ничего из этого не задействовано в
живом боте — `backend/` (Go) нигде не задеплоен (см. корневой `CLAUDE.md`: "No Go backend... in production").
Покупка GSTD за Stars, описанная в `STARS_PURCHASE.md`, также не реализована в текущем `webhook.ts` — при
необходимости этот флоу нужно строить заново.

## Проверка

```bash
curl -X POST https://app.gstdtoken.com/api/v1/telegram/webhook \
  -H "Content-Type: application/json" \
  -d '{"message":{"message_id":1,"chat":{"id":1,"type":"private"},"from":{"id":1,"first_name":"test"},"text":"/help"}}'
```
