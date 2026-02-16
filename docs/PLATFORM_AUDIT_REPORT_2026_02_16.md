# GSTD Platform — Аудит и отчёт о состоянии

**Дата:** 16 февраля 2026  
**Цель:** Проверка платформы, фиксация работающего/неработающего, проблемы и рекомендации

---

## 1. Сборка и запуск

| Компонент | Статус | Примечание |
|-----------|--------|------------|
| Backend (Go) | ✅ Собирается | `go build .` — успешно |
| Frontend (Next.js) | ✅ Собирается | `npm run build` — успешно, 27 страниц |
| Backend запуск | ✅ Инициализируется | Падает только при занятом порте 8080 |

---

## 2. Что работает на платформе

### 2.1 Ядро и API

| Компонент | Эндпоинты / Функция | Статус |
|-----------|---------------------|--------|
| **Health & Config** | `GET /api/v1/health`, `GET /api/v1/config` | ✅ |
| **Chat / Inference** | `POST /api/v1/chat/completions`, Ultra Status | ✅ |
| **TonConnect Auth** | `POST /api/v1/users/login`, сессии | ✅ |
| **Tasks** | CRUD tasks, payment, device claim/result | ✅ |
| **Devices / Nodes** | Регистрация, heartbeat, `GET /nodes/public` | ✅ |
| **Stats & Network** | `/stats/public`, `/network/stats`, `/network/map` | ✅ |
| **Pool & Treasury** | `/pool/status`, Golden Reserve | ✅ |
| **Market** | Swap quote, X402 buy | ✅ |
| **Referrals** | Apply code, stats | ✅ |
| **Onboarding / Tokens** | `/tokens/welcome`, `/tokens/faucet`, `/tokens/tasks` | ✅ |
| **Viral Analytics** | Share, Click, Community Favorite | ✅ |
| **Admin** | Architect, Commission, Sync balances, Seeds | ✅ |
| **WebSocket** | `/ws` — real-time updates | ✅ |

### 2.2 Протоколы (Genesis Launch, Eternal Flame)

| Протокол | Описание | Статус |
|----------|----------|--------|
| **Genesis Launch** | Compare Mode priority (balance>500), Viral Loop, Golden Liquidity | ✅ |
| **Eternal Flame** | Node failover 30s, Auto-Scale +5% rewards, Archon Oversight | ✅ |

### 2.3 Сервисы (фоновые)

| Сервис | Интервал | Статус |
|--------|----------|--------|
| TimeoutService | 30s | ✅ |
| PaymentWatcher | 60s | ✅ |
| Treasury (GSTD→XAUt) | 5 min | ✅ |
| Golden Age (Payout Waves) | 5 min | ✅ |
| Dynamic Equilibrium | 24h + 15 min | ✅ |
| Eternal Flame | 10s / 5 min / 1h | ✅ |
| Node Heartbeat Flush | 45s | ✅ |

### 2.4 Frontend

| Страница | Маршрут | Статус |
|----------|---------|--------|
| Landing | `/` | ✅ |
| Dashboard | `/dashboard` | ✅ |
| Chat | `/dashboard?tab=chat` | ✅ |
| Stats | `/stats` | ✅ |
| Network | `/network` | ✅ |
| About | `/about` | ✅ |
| Agent | `/agent` | ✅ |
| TMA | `/tma` | ✅ |
| Admin Architect | `/admin/architect` | ✅ |

---

## 3. Что не работает или ограничено

### 3.1 Зависимости от внешних сервисов

| Сервис | Условие | Проблема |
|--------|---------|----------|
| **Ollama** | `OLLAMA_URL` | Без Ollama `/chat/completions` не выполняет inference |
| **TON API** | `TON_API_KEY`, `TON_API_URL` | Балансы, контракты — без ключа ограничено |
| **Redis** | Обязателен | Сессии, rate limit, Compare Mode queue |
| **PostgreSQL** | Обязателен | Вся персистентность |
| **BRIDGE_ENCRYPTION_KEY** | Обязателен | Без него backend не стартует |

### 3.2 Опциональные (выключены по умолчанию)

| Компонент | Env | Статус |
|-----------|-----|--------|
| Leviathan | `LEVIATHAN_ENABLED=true` | Выключен по умолчанию |
| Telegram Bot | `BOT_TOKEN`, `CHAT_ID` | Выключен при отсутствии |
| Predictive Mirroring | `LEVIATHAN_ENABLED` | Зависит от Leviathan |

### 3.3 Удалено

| Компонент | Причина |
|-----------|---------|
| Polymarket Bridge | Направление — своя платформа |

---

## 4. Проблемы и риски

### 4.1 Миграции

| Проблема | Описание |
|----------|----------|
| **Дубликат v67** | `v67_singularity_ready.sql` и `v67_zero_start_credit.sql` — один префикс, возможен конфликт порядка |
| **Сортировка по имени** | `v5` идёт перед `v53` (лексикографически). Для v0–v9 vs v10+ порядок корректен, но дубликаты v67 могут создать неоднозначность |
| **v53_polymarket_bridge.sql** | Файл остался; v71 дропает таблицы. Можно удалить v53 для чистоты |

### 4.2 Конфигурация

| Проблема | Рекомендация |
|----------|--------------|
| `API_BASE_URL` в dev | По умолчанию `localhost:8080` — проверить `.env` для локальной разработки |
| `NEXT_PUBLIC_API_URL` | Должен совпадать с backend URL при деплое |

### 4.3 Безопасность

| Элемент | Статус |
|---------|--------|
| `BRIDGE_ENCRYPTION_KEY` | Обязателен, без него — fatal |
| `GIN_MODE=release` | По умолчанию |
| Admin API Key | Для `/admin/*`, `/internal/*` |

---

## 5. Рекомендации

### 5.1 Срочные

1. **Миграции v67** — переименовать один файл, например в `v67a_singularity_ready.sql` и `v67b_zero_start_credit.sql`, или объединить в один.
2. **Удалить v53_polymarket_bridge.sql** — Polymarket убран, миграция лишняя.
3. **Проверить порядок миграций** — при первом запуске на чистой БД убедиться, что все применяются без ошибок.

### 5.2 Средний приоритет

1. **Документация .env** — описать все переменные в `.env.example` с комментариями.
2. **Health check** — добавить readiness/liveness для k8s/Docker (отдельные эндпоинты при необходимости).
3. **Ollama** — явно документировать необходимость Ollama для chat и варианты без него (например, proxy на внешний API).

### 5.3 Долгосрочные

1. **Тесты** — добавить интеграционные тесты для основных API.
2. **Мониторинг** — Prometheus `/metrics` уже есть; настроить алерты.
3. **Миграции** — перейти на нумерацию с padding (v001, v002) для стабильного порядка.

---

## 6. Сводка

| Категория | Оценка |
|-----------|--------|
| Сборка | ✅ Стабильна |
| Основной функционал | ✅ Работает |
| Genesis Launch | ✅ Включён |
| Eternal Flame | ✅ Включён |
| Polymarket | ❌ Удалён |
| Миграции | ⚠️ Требуют внимания (v67, v53) |
| Внешние зависимости | ⚠️ TON, Ollama, Redis, PostgreSQL обязательны |

**Вывод:** Платформа в рабочем состоянии. Основные риски — порядок миграций и корректность конфигурации окружения.
