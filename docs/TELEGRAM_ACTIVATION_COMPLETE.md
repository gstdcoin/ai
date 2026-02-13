# Telegram Activation — Готово

**Дата:** 12 февраля 2026

## Что сделано

### 1. ProcessWebhook (Backend)

Команды обрабатываются в `backend/internal/services/telegram_service.go`:

| Команда | Доступ | Описание |
|---------|--------|----------|
| `/start` | Все | Приветствие + кнопка «📱 Открыть приложение» (Web App) |
| `/help` | Все | Справка и ссылка на дашборд |
| `/status` | Только админ | Database, Contract, Sovereign AI |
| `/balance` | Только админ | Баланс escrow, кол-во пользователей |
| `/admin` | Только админ | Панель с кнопками: Status, Balance, Pending Withdrawals |

**Безопасность:** `/status` и `/balance` отвечают только если `sender_id == TELEGRAM_CHAT_ID`.

### 2. Конфигурация

- **.env:** `TELEGRAM_CHAT_ID=5700385228` (замени на свой ID от @userinfobot)
- **NotifyAdmin:** `POST /api/v1/internal/telegram/notify-audit` (X-Admin-API-Key)
- **night_audit.sh:** В конце скрипта отправляет отчёт в Telegram

### 3. Автономный бот

- **gstd_bot** запущен: `docker ps | grep gstd_bot`
- **Сеть:** `ubuntu_gstd_network`
- **Примечание:** Webhook получает все обновления; LongPoller в autonomy bot не получает сообщений. Команды обрабатываются backend webhook.

### 4. Git

```
feat: telegram commands and autonomy bot activation
```

## Как проверить

1. Напиши боту @GstdAppBot в Telegram: `/start`
2. Если твой Chat ID = TELEGRAM_CHAT_ID, напиши `/status` и `/balance`
3. Night audit: cron каждый час → уведомление в Telegram (если CHAT_ID задан)

## Узнать свой Chat ID

Напиши @userinfobot в Telegram — он вернёт твой числовой ID. Пропиши его в `.env`:

```
TELEGRAM_CHAT_ID=твой_id
```

И перезапусти backend: `docker compose -f docker-compose.prod.yml up -d backend-blue backend-green`
