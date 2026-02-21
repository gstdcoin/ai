# GSTD Platform — Отчёт о состоянии

**Дата:** 21 февраля 2026  
**Сервер:** Ubuntu (production)

---

## 1. Состояние сервисов

| Сервис | Статус | Порт | Описание |
|--------|--------|------|----------|
| **PostgreSQL** | ✅ healthy | 5432 | БД distributed_computing |
| **Redis** | ✅ healthy | 6379 | Сессии, rate limit, кеш |
| **Backend (blue)** | ✅ 4 реплики healthy | 8080 | Go API |
| **Backend (green)** | ✅ 3 реплики healthy | 8080 | Go API |
| **Frontend** | ✅ healthy | 3001→3000 | Next.js |
| **Nginx LB** | ✅ healthy | 8080, 9080, 9443 | Прокси, SSL |

**Всего контейнеров:** 11 (все healthy)

---

## 2. Проверенные API endpoints

| Endpoint | Метод | Статус | Ответ |
|----------|-------|--------|-------|
| `/api/v1/health` | GET | ✅ 200 | DB, TON contract, Sovereign AI (Ollama) |
| `/api/v1/market/price` | GET | ✅ 200 | gstd_price_usd, buy_links (Ston.fi, DeDust, manual) |
| `/api/v1/system/integrity` | GET | ✅ 200 | manifest_hash для A2A |
| `/api/v1/pool/status` | GET | ✅ 200 | Ликвидность, GSTD balance |
| `/api/v1/stats/public` | GET | ✅ 200 | Статистика платформы |
| `/api/v1/agents/handshake` | POST | ✅ | A2A регистрация устройств |

---

## 3. Реализованные функции

### Frontend
- **Dashboard** — упрощён, Buy GSTD с live ценой
- **DevicesPanel** — A2A connect, инструкции для любых устройств
- **HelpPanel** — раздел «Как купить GSTD» (Telegram Wallet)
- **ChatPanel** — Free Basic Tier (5 req/day при balance < 0.01)
- **Главная** — упрощённый hero, FAQ

### Backend
- **A2A** — `GET /system/integrity`, `POST /agents/handshake`
- **Market** — `getMarketPrice` с Ston.fi pool, `getBuyLinksMap` (без GSTD_Bot)
- **Gateway** — Free Basic Tier для чата
- **Pool Monitor** — `GetGSTDPriceUSD` предпочитает Ston.fi

### Документация
- `docs/BUY_GSTD_TELEGRAM_WALLET.md` — мини-инструкция покупки GSTD
- `docs/A2A_CONNECTION.md` — A2A endpoints, Genesis hash
- `docs/CONTRACTS_VERIFICATION.md` — SettlementMaster, TreasuryGold, безопасность

---

## 4. Публичные репозитории

| Репозиторий | Описание | Ссылка |
|-------------|----------|--------|
| **gstdcoin/ai** | Основная платформа (backend, frontend, contracts) | https://github.com/gstdcoin/ai |
| **gstdcoin/A2A** | Agent-to-Agent протокол для GSTD Grid | https://github.com/gstdcoin/A2A |

---

## 5. Buy Links (актуальные)

| Канал | URL |
|-------|-----|
| Ston.fi | https://app.ston.fi/swap?ft=TON&tt=GSTD |
| DeDust | https://dedust.io/swap/TON/GSTD |
| Telegram Wallet | https://t.me/wallet |
| Инструкция | https://github.com/gstdcoin/ai/blob/main/docs/BUY_GSTD_TELEGRAM_WALLET.md |

**Удалено:** `t.me/GSTD_Bot?start=buy` (не существует)

---

## 6. Тесты

```
Backend: ok (a2a, api, genesis, hive, inference, node, sentinel, services, leviathan, settlement)
```

---

## 7. Незакоммиченные изменения

Рекомендуется закоммитить:
- `backend/internal/api/routes.go`, `routes_a2a.go`, `onboarding_handler.go`
- `frontend/src/components/dashboard/*` (Dashboard, HelpPanel, DevicesPanel, ChatPanel)
- `frontend/public/locales/*`
- `docs/BUY_GSTD_TELEGRAM_WALLET.md`, `A2A_CONNECTION.md`, `CONTRACTS_VERIFICATION.md`

---

## 8. Доступ

- **Локально:** http://127.0.0.1:8080 (API), http://127.0.0.1:9080 (app), http://127.0.0.1:3001 (frontend direct)
- **Продакшн:** https://app.gstdtoken.com

---

*Платформа перезапущена, все сервисы healthy, реализованные функции работают.*
