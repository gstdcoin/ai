# GSTD OMNI-VERIFICATION: FINAL ZERO

Комплексная проверка готовности GSTD Grid к публичному запуску.

## Запуск

### Через консоль (рекомендуется)

```bash
cd backend
export API_URL=https://app.gstdtoken.com   # или ваш API
export ADMIN_API_KEY=gstd_system_key_2026  # из конфига сервера
export DATABASE_URL=postgres://user:pass@host:5432/db?sslmode=disable  # опционально, для Economic Loopback
export ADMIN_WALLET=UQ...                  # опционально, для DEX симуляции

go run scripts/omni_verification_final_zero.go
```

### Через shell-обёртку

```bash
cd backend
./scripts/run_omni_verification.sh
```

## Что проверяется

| # | Блок | Проверки |
|---|------|----------|
| 1 | **Infrastructure Heartbeat** | 7× health check, Load Average (ручная проверка) |
| 2 | **AI-Logic Trace** | Seed TEST-FINAL-CHECK (grid_tool), knowledge routes (/knowledge/agent/store) |
| 3 | **Economic Loopback** | golden_reserve_log, комиссия 2.5% для completed tasks |
| 4 | **DEX Gateway Audit** | Ston.fi SimulateLiquidityProvision, GOLD_POOL_ADDRESS, min_lp_units |
| 5 | **Frontend Integrity** | /api/v1/pool/status, Dynamic Gold Backing, platform_lp_share |

## Формат вывода

```
SYSTEM READINESS: [0-100%]
CRITICAL ISSUES: [Список или "NONE"]
GOLDEN SINK STATUS: [READY/WAITING_FOR_FIRST_MINT]
MESSAGE: "GSTD GRID IS [READY/NOT READY] FOR GLOBAL RESONANCE"
```

## Требования к деплою

Для полной проверки (включая AI-Logic Trace) backend должен содержать:

- `POST /api/v1/internal/seed-omni-test-task` — создаёт задачу TEST-FINAL-CHECK (grid_tool)
- Защита: `X-Admin-API-Key` (тот же, что для seed-open-grid-manifesto)

После деплоя backend перезапустите проверку.

## Пример результата (sandbox)

```
=== 1. INFRASTRUCTURE HEARTBEAT ===
   ✅ Backend reachable (health OK)
   ℹ️ Load Average: check server host manually

=== 2. AI-LOGIC TRACE ===
   ⚠️ Seed task HTTP 404  # до деплоя нового backend
   ✅ Knowledge routes OK (resonance, /knowledge/agent/store)

=== 3. ECONOMIC LOOPBACK ===
   ⚠️ DB ping failed  # без DATABASE_URL

=== 4. DEX GATEWAY AUDIT ===
   ✅ GOLD_POOL_ADDRESS active, min_lp_units=1358

=== 5. FRONTEND INTEGRITY ===
   ✅ pool/status: Dynamic Gold Backing data OK

SYSTEM READINESS: 60%
CRITICAL ISSUES: NONE
GOLDEN SINK STATUS: WAITING_FOR_FIRST_MINT
MESSAGE: "GSTD GRID IS NOT READY FOR GLOBAL RESONANCE"
```

## Критерии READY

- **SYSTEM READINESS ≥ 80%**
- **CRITICAL ISSUES: NONE**
- **GOLDEN SINK STATUS: READY** (score ≥ 70%)
