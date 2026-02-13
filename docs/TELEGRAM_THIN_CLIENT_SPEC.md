# GSTD Telegram Thin Client — Спецификация

**Дата:** 11 февраля 2026  
**Цель:** Тонкий клиент платформы в Telegram-боте с полным функционалом, авторизацией через кошелёк и нативным мобильным интерфейсом.

---

## 1. Текущее состояние

| Компонент | Статус | Описание |
|-----------|--------|----------|
| Backend webhook | ✅ | `/start`, `/status`, `/balance` в `telegram_service.go` |
| autonomy/bot | ⚠️ | LongPoller, меню с WebApp — может не получать сообщения при webhook |
| tg-miner.html | ⚠️ | Только майнинг, без TonConnect, без полного дашборда |
| app.gstdtoken.com | ✅ | Полный дашборд, TonConnect, mobile layout (BottomNav) |
| Admin UI | ❌ | API есть, кнопок управления нет |

---

## 2. Архитектура тонкого клиента

### 2.1 Вариант A: Web App = полное приложение (рекомендуется)

**URL:** `https://app.gstdtoken.com` (или `https://app.gstdtoken.com/twa` для мобильной версии)

- При открытии в Telegram WebApp: `isTelegramWebApp() === true`
- Показывается мобильный layout (BottomNav, без десктопного Header)
- TonConnect работает в TWA
- Один кодбаза, адаптация через CSS и условный рендер

**Плюсы:** Один деплой, все фичи, уже реализовано.  
**Минусы:** Загрузка всего Next.js (можно оптимизировать code splitting).

### 2.2 Вариант B: Отдельная TWA-страница (tg-miner → full)

- `tg-miner.html` расширяется до полного дашборда
- TonConnect SDK подключается
- Отдельная сборка или статическая страница

**Плюсы:** Лёгкая загрузка.  
**Минусы:** Дублирование логики, два фронтенда.

### 2.3 Решение

**Использовать Вариант A:** Основное приложение уже поддерживает TWA. Нужно:
1. Добавить в бота кнопку Web App, открывающую `https://app.gstdtoken.com`
2. Убедиться, что при открытии из бота приложение определяет TWA и показывает мобильный UI
3. tg-miner.html оставить как лёгкую альтернативу «только майнинг» или редирект на полное приложение

---

## 3. Функционал в боте

### 3.1 Команды (все пользователи)

| Команда | Действие |
|---------|----------|
| `/start` | Приветствие + кнопка «📱 Открыть приложение» (Web App) |
| `/help` | Список команд и ссылка на приложение |

### 3.2 Команды (только админ, TELEGRAM_CHAT_ID)

| Команда | Действие |
|---------|----------|
| `/status` | Database, Contract, Sovereign AI |
| `/balance` | Escrow, пользователи |
| `/admin` | Inline-кнопки: Sync Balances, Pending Withdrawals, Broadcast |

### 3.3 Inline-кнопки админа

При `/admin`:
- **Sync Balances** → вызов `POST /admin/sync-gstd-balances`
- **Pending Withdrawals** → список + кнопки Approve по каждому
- **Broadcast** → запрос текста, затем `POST /admin/broadcast`

---

## 4. Интерфейс в TWA (мобильный)

### 4.1 Экраны (табы BottomNav)

1. **Chat** — Sovereign AI чат
2. **Mining** — Ignite/Stop, SovereignSwitch, баланс
3. **Agents** — маркетплейс агентов
4. **Nodes** — устройства
5. **Stats** — статистика

### 4.2 Отличия от «адаптированного сайта»

- BottomNav всегда виден (уже есть)
- Header скрыт в TWA (уже есть: `!isTelegramWebApp() &&`)
- Крупные touch-таргеты (44px)
- Haptic feedback на действия
- Цвета из `--tg-theme-*`

### 4.3 Авторизация

- TonConnect в TWA
- После подключения кошелька → session token → API с `X-Session-Token`
- Редирект на `/dashboard`

---

## 5. Деплой и активация

### 5.1 Активация изменений на платформе

```bash
# Пересборка и перезапуск
docker compose -f docker-compose.prod.yml build --no-cache frontend backend
docker compose -f docker-compose.prod.yml up -d frontend backend-blue backend-green

# Или blue-green
./scripts/deploy.sh
```

### 5.2 Настройка бота

1. **BotFather:** создать бота, получить токен
2. **Web App URL:** `https://app.gstdtoken.com`
3. **Menu Button:** установить через API `setChatMenuButton`:
   ```json
   {"menu_button": {"type": "web_app", "text": "Open App", "web_app": {"url": "https://app.gstdtoken.com"}}}
   ```

---

## 6. Чек-лист реализации

- [ ] Backend: /start с Web App кнопкой
- [ ] Backend: /admin с inline-кнопками (admin only)
- [ ] Backend: обработка callback_query для admin actions
- [ ] tg-miner: редирект на app или TonConnect + полный UI
- [ ] Deploy script: `./scripts/deploy_platform.sh`
- [ ] Документация: TELEGRAM_SETUP.md обновить
