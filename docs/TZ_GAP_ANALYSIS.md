# Анализ соответствия ТЗ текущей реализации GSTD

**Дата:** 2026-02-15  
**Источник:** Техническое задание / Промт для разработки экосистемы GSTD

---

## Сводка

| Раздел ТЗ | Статус | Покрытие |
|-----------|--------|----------|
| 1. Концепция и УТП | 🟡 Частично | DePIN + SLM есть, Pay-for-Result $0.03 — не зафиксировано |
| 2. UI и Onboarding (Telegram/TON) | ✅ Реализовано | Wallet-as-Node, TonConnect, Mining promo |
| 3. Финансовое ядро | 🟡 Частично | Escrow, Treasury, Lending есть; автоматизация XAUt — частично |
| 4. Мультичейн | 🔴 Не реализовано | Только TON; Solana, XRPL отсутствуют |
| 5. Бэкенд и инфраструктура | ✅ Реализовано | Swarm, метрики, dashboard |
| 6. Токеномика | ✅ Соответствует | GSTD, 1B supply, decimals 9 |

---

## 1. Концепция и УТП

### ТЗ
- DePIN-платформа, агрегация мощностей смартфонов для SLM и инференса
- Pay-for-Result ~$0.03/результат (экономия 70% vs облако)
- Преобразование мощности в золото (XAUt)

### Текущее состояние
- ✅ DePIN-архитектура: `NodeService`, `TaskService`, `MobileComputeService`, `WorkerService`
- ✅ SLM: Ollama-интеграция, `qwen2.5-coder`, guardrails
- ✅ Золото: Golden Reserve, XAUt, `gold_hash_rate_service`
- ⚠️ Цена $0.03/результат не зафиксирована в коде; используется динамическая модель наград

**Рекомендация:** Добавить константу/конфиг `TARGET_PRICE_PER_RESULT_USD = 0.03` и использовать в расчёте наград.

---

## 2. Пользовательский интерфейс и Onboarding (Telegram/TON)

### ТЗ
- Telegram Mini App
- TonConnect для входа
- «Майнинг в один клик» — кнопка «Start Worker»
- Фоновый режим без стороннего ПО
- Метрики: Хешрейт, Активные ноды, Заработок

### Текущее состояние
- ✅ **Telegram Mini App:** `frontend` с `twaReturnUrl`, `isTelegramWebApp`
- ✅ **TonConnect:** `@tonconnect/ui-react`, `TonConnectUIProvider`, `TonConnectValidator`
- ✅ **Wallet-as-Node:** `/start mining`, `activate-wallet`, кнопки «Start Mining» / «Share Mining»
- ✅ **Метрики:** `StatsPanel`, `TreasuryWidget`, `PoolStatusWidget`, `gold_reserve`, `total_hashrate`, `active_workers`
- ✅ **Mining promo:** `/?source=telegram&mode=mining`, Leviathan growth learning

**Файлы:** `telegram_service.go`, `Dashboard.tsx`, `WalletConnect.tsx`, `TasksPanel.tsx`

---

## 3. Финансовое ядро и Смарт-контракты

### А. Escrow 2.0

| Требование ТЗ | Реализация |
|---------------|------------|
| 95% бюджета в Escrow | ✅ `EscrowService`, `task_escrow`, `total_locked_gstd` |
| Выплата после PoW | ✅ Pull-model: `BuildPayoutIntent`, воркер подписывает через TonConnect |
| Возврат при невыполнении | ✅ Refund flow в `ClientDashboard`, `handleRequestRefund` |
| 5% комиссия | ✅ `platformFee: 0.05` (50% dev, 50% gold) |

### Б. Treasury и «Золотой шлюз»

| Требование ТЗ | Реализация |
|---------------|------------|
| 5% → XAUt | 🟡 Часть комиссии идёт в `gold_reserve`; автоматическая конвертация в XAUt — через Ston.fi/LP, не прямой swap |
| 70% Net Protocol Revenue → золото | ⚠️ Логика не явно закодирована; `gold_reserve` пополняется, но формула 70% не видна |
| Night Audit 00:00 UTC | 🟡 `night_audit.sh` существует; расписание через cron — нужно проверить `00:00 UTC` |
| Публичная проверка резервов | ✅ `golden_reserve_log`, `GET /api/v1/stats/public`, `golden_reserve_xaut` |

**Файлы:** `escrow_service.go`, `routes_stats.go`, `autonomy/bin/night_audit.sh`

### В. Кредитный протокол (Lending)

| Требование ТЗ | Реализация |
|---------------|------------|
| Займ USDT/USDC под залог GSTD | 🟡 `LendingService` считает условия; нет UI и смарт-контракта выдачи |
| Ставка 1.5% годовых | ✅ `apr := 1.5` |
| LTV до 60% | ✅ `ltv := 0.60` |

**Файлы:** `lending_service.go`, `GET /api/v1/lending/quote`

**Рекомендация:** Добавить UI для Lending и интеграцию с протоколом выдачи (DeFi или кастодial).

---

## 4. Мультичейн-архитектура

### ТЗ
- **TON:** точка входа, Telegram, микротранзакции ✅
- **Solana:** трейдинг, DePIN, 65k TPS 🔴
- **XRPL:** институциональный уровень, золото, CBDC 🔴

### Текущее состояние
- ✅ **TON:** полная интеграция — контракты, Ston.fi, TonConnect, Jetton
- 🔴 **Solana:** нет кода
- 🔴 **XRPL:** нет кода

**Рекомендация:** Фазировать: Phase 1 — TON (текущее), Phase 2 — Solana bridge, Phase 3 — XRPL для золота.

---

## 5. Бэкенд и инфраструктура

### ТЗ
- SLM-инференс и AI-обработка
- Swarm — разбиение на микро-задачи
- Метрики: хешрейт, золотой пул, bridge status, ноды, география

### Текущее состояние
- ✅ **SLM:** `InferenceService`, Ollama, guardrails
- ✅ **Swarm:** `SovereignBridgeService`, `bridge_tasks`, match/execute
- ✅ **Метрики:** `GET /api/v1/stats/public`, `GET /api/v1/network/stats`, `gold_reserve`, `total_tflops`, `active_devices_count`, `bridge_status`
- ✅ **География:** `GeoService`, H3, `nodes` (country, lat/lon)

---

## 6. Токеномика

### ТЗ
- Тикер GSTD, сеть TON, Supply 1B, decimals 9
- Утилити: залог, доступ, индекс золота

### Текущее состояние
- ✅ Соответствует конфигурации и документации

---

## Реализовано (2026-02-15)

1. ✅ **Night Audit** — `GET /api/v1/audit/reserves`, `scripts/crontab.gstd` (00:00 UTC), проверка XAUt vs circulating GSTD
2. ✅ **Lending UI** — `LendingPanel`, вкладка Lending, расчёт условий (60% LTV, 1.5% APR)
3. ✅ **70% Net Revenue → Gold** — `EconomicsConfig.NetRevenueToGoldPct`, `NewEscrowServiceWithEconomics`
4. ✅ **$0.03/результат** — `TARGET_PRICE_PER_RESULT_USD` в config, экспорт в `GET /api/v1/config`

## Приоритеты доработки

1. **Средний:** Lending — полный flow выдачи USDT/USDC (смарт-контракт/интеграция)
2. **Низкий:** Solana/XRPL — архитектура и фазирование

---

## Ссылки на ключевые файлы

| Компонент | Путь |
|-----------|------|
| Escrow | `backend/internal/services/escrow_service.go` |
| Lending | `backend/internal/services/lending_service.go` |
| Treasury/Stats | `backend/internal/api/routes_stats.go` |
| Telegram/Wallet-as-Node | `backend/internal/services/telegram_service.go` |
| Night Audit | `autonomy/bin/night_audit.sh` |
| Dashboard | `frontend/src/components/dashboard/Dashboard.tsx` |
| TonConnect | `frontend/src/components/WalletConnect.tsx` |
