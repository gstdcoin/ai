# Total Domination Protocol — GSTD in Telegram Mini App

Протокол переноса экосистемы GSTD в Telegram Mini App (TMA).

## 1. Unified Dashboard

- **Структура**: Вкладки Overview | Worker | Golden Gateway
- **Управление воркером**: Кнопка запуска инференса, ссылка на Agent Node
- **Live Hashrate**: Визуализация вычислительной мощности (анимированный прогресс-бар)
- **Golden Accumulation**: Прогресс к 1 XAUt, множитель золота

**Файлы**: `frontend/src/pages/tma.tsx`, `frontend/src/components/tma/LiveHashrateChart.tsx`, `frontend/src/components/tma/GoldenAccumulationChart.tsx`

## 2. Worker Logic (In-App)

- **SLM Inference**: Лёгкий sentiment-анализ в Web Worker (rule-based)
- **Защита от перегрева**:
  - Battery API: throttle при уровне < 20% и не на зарядке
  - Tab visibility: снижение частоты при скрытой вкладке
  - Cooldown 5s после thermal throttle

**Файл**: `frontend/public/workers/inference-worker.js`

## 3. Leviathan Stream Bridge

- **SSE**: `GET /api/v1/leviathan/stream` — Server-Sent Events
- **WebSocket**: `GET /api/v1/leviathan/ws` — альтернатива
- **Ticker**: Бегущая строка на всех экранах TMA
- **Локализация**: Ключевые фразы тикера переводятся (RU/EN)

**Файл**: `frontend/src/components/tma/LeviathanTMATicker.tsx`

## 4. Financial Layer — Escrow 2.0

- **API**: `GET /api/v1/billing/balance/:wallet`, `GET /api/v1/billing/transactions/:wallet`
- **Golden Gateway**: Мгновенное отображение транзакций (worker_payout, escrow_lock, etc.)
- **Backend**: `BillingService.GetWalletTransactions` → `EscrowService.GetTransactionHistory`

**Файлы**: `frontend/src/components/tma/GoldenGatewayTransactions.tsx`, `backend/internal/api/routes_billing.go`

## 5. Global Localization

- **Источник**: `Telegram.WebApp.initDataUnsafe.user.language_code`
- **Логика**: `ru` или `ru-*` → locale `ru`, иначе `en`
- **Синхронизация**: `useTMALocaleSync()` перенаправляет на `/ru/tma` или `/tma`

**Файл**: `frontend/src/hooks/useTMALocale.ts`

## Маршруты

| URL | Описание |
|-----|----------|
| `/tma` | TMA Dashboard (default EN) |
| `/ru/tma` | TMA Dashboard (RU) |

## Зависимости

- TonConnect для подключения кошелька
- next-i18next для локализации
- EventSource для Leviathan SSE
