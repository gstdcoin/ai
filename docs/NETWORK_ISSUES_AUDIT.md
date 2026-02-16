# GSTD Platform — Потенциальные проблемы сети

**Дата:** 15 февраля 2026  
**Цель:** Выявить что мешает сети и что не работает

---

## 1. Критичные (блокируют работу)

### 1.1 Telegram Bot: Webhook vs Long Polling

**Проблема:** Взаимоисключающие режимы.

- **Webhook** — Telegram шлёт все обновления на backend `/api/v1/telegram/webhook`
- **Long Polling** — autonomy bot (отдельный процесс) тянет обновления из Telegram API

**Если webhook установлен** → autonomy bot не получает обновления (Telegram не шлёт в getUpdates).

**Текущее состояние:** Backend ProcessWebhook уже обрабатывает `/connect`, `/take`, `/complete`, balance, nodes через `callBotAPI` → relay на `/api/v1/telegram/bot/*`. При webhook режиме backend полностью обрабатывает команды. Autonomy bot нужен только при Long Polling (без webhook).

---

### 1.2 Ollama / Inference

**Проблема:** Chat и inference зависят от Ollama.

- `OLLAMA_URL` — по умолчанию `http://host.docker.internal:11434`
- Если Ollama не запущен или недоступен → `/chat/completions`, `/infer` возвращают ошибки

**Симптомы:** "inference_unavailable", таймауты при запросах к AI.

---

### 1.3 Leviathan (опционально)

**Проблема:** Leviathan отключён по умолчанию.

- `LEVIATHAN_ENABLED=true` — нужен для prediction market, IQ, long_term_lessons
- Без него: нет IQ ticker, нет Sub-agents при IQ 95+, нет обучения на рынках

**Не блокирует** основную работу платформы.

---

## 2. Инфраструктурные

### 2.1 CreateTaskModal — сирота ✅ ИСПРАВЛЕНО

**Было:** Мёртвый код, не импортировался. **Удалён.**

---

### 2.2 TokenEarnPanel — относительные URL ✅ ИСПРАВЛЕНО

**Файл:** `frontend/src/components/TokenEarnPanel.tsx`

- Все `fetch('/api/v1/tokens/...')` заменены на `fetch(\`${API_BASE_URL}/api/v1/tokens/...\`)`

---

### 2.3 OnboardingWizard — относительные URL ✅ ИСПРАВЛЕНО

**Файл:** `frontend/src/components/OnboardingWizard.tsx`

- `fetch('/api/v1/tokens/welcome')` заменён на `fetch(\`${API_BASE_URL}/api/v1/tokens/welcome\`)`

---

### 2.4 Next.js rewrite на localhost

**Файл:** `frontend/next.config.js`

```js
rewrites() {
  return [{ source: '/api/:path*', destination: 'http://localhost:8080/api/:path*' }];
}
```

- В Docker frontend контейнер не видит backend по localhost:8080
- В проде nginx сам проксирует /api на backend — rewrite не используется
- В dev при `npm run dev` — Next.js проксирует на localhost:8080, что ок

**Риск:** При standalone-сборке и деплое без nginx rewrite может не работать.

---

## 3. Backend / API

### 3.1 tasks/worker/pending vs marketplace/tasks

**Два потока задач:**

1. **Legacy:** `GET /api/v1/tasks/worker/pending` — TaskPaymentService, задачи с `pending_payment`
2. **Marketplace:** `GET /api/v1/marketplace/tasks` — MarketplaceHandler, задачи с escrow

A2A SDK вызывает `tasks/worker/pending`. Воркеры могут не видеть marketplace-задачи, если они в другой системе.

---

### 3.2 Invoices — pay_invoice

**Файл:** `gstd_skill_pkg/python-sdk/gstd_a2a/gstd_client.py`

- `pay_invoice` создаёт фейковый `tx_hash` и не выполняет реальный перевод GSTD
- A2A-оплата между агентами через invoices не завершена

---

### 3.3 TODO в коде

| Файл | Описание |
|------|----------|
| `sovereign_bridge_service.go` | "TODO: Integrate with actual STON.fi/DeDust API", "TODO: Implement refund logic" |
| `routes_bridge.go` | "TODO: Implement full task status retrieval", "TODO: Implement escrow release" |
| `leviathan/hyper_sensors.go` | Много TODO (HuggingFace, GitHub, PubMed и т.д.) — не критично |

---

## 4. Конфигурация / Окружение

### 4.1 Обязательные переменные

| Переменная | Назначение | Последствия при отсутствии |
|------------|------------|----------------------------|
| `DB_PASSWORD` | PostgreSQL | Backend не стартует |
| `REDIS_*` | Redis | Нет сессий, rate limit |
| `TON_*` | TON API, контракты | Нет выплат, нет проверки балансов |
| `TELEGRAM_BOT_TOKEN` | Telegram | Бот не работает |

---

### 4.2 Опциональные

| Переменная | Эффект |
|------------|--------|
| `OLLAMA_URL` | Без Ollama — нет inference |
| `LEVIATHAN_ENABLED=true` | Включает Leviathan |
| `DISABLE_MAINTENANCE_ALERTS=true` | Отключает отчёты в Telegram |
| `GNEWS_API_KEY`, `CRYPTOPANIC_API_KEY` | Leviathan news/sentiment |

---

## 5. Сводка

| Категория | Критичность | Действие |
|-----------|-------------|----------|
| Webhook vs Long Polling | Высокая | Выбрать один режим, расширить обработчики |
| Ollama недоступен | Высокая | Запустить Ollama или использовать fallback |
| CreateTaskModal сирота | Низкая | Удалить или скрыть |
| TokenEarnPanel URL | Низкая | Перейти на API_BASE_URL |
| pay_invoice не реализован | Средняя | Реализовать реальный перевод или пометить как beta |
| Leviathan выключен | Низкая | Включить при необходимости |

---

## 7. Исправлено при проверке (15.02.2026)

### WorkerService — WebSocket URL в production

**Проблема:** `process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8080/ws'` — в production без переменной окружения использовался localhost, WebSocket не подключался.

**Исправление:** Использовать `WS_URL` из `config.ts` (wss://app.gstdtoken.com в production) с добавлением `/ws` при необходимости.

---

## 6. Быстрая проверка работоспособности

```bash
# Backend health
curl -s https://app.gstdtoken.com/api/v1/health | jq

# Chat (требует Ollama)
curl -X POST https://app.gstdtoken.com/api/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"qwen2.5-coder:7b","messages":[{"role":"user","content":"Hi"}]}'

# Infer (публичный)
curl "https://app.gstdtoken.com/api/v1/infer?prompt=Hello&model=full"

# Nodes
curl -s https://app.gstdtoken.com/api/v1/nodes/public | jq
```
