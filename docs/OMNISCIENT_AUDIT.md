# GSTD TOTAL INTEGRITY: THE OMNISCIENT AUDIT

Тотальный аудит экосистемы GSTD Grid перед публичным запуском.

## Запуск

```bash
cd backend
export API_URL=https://app.gstdtoken.com
export ADMIN_API_KEY=gstd_system_key_2026
export DATABASE_URL=postgres://user:pass@host:5432/db?sslmode=disable  # для Financial Precision
export BACKEND_CONTAINER=ubuntu-backend-blue-1  # для проверки логов

go run scripts/omniscient_audit.go
```

Или: `./scripts/run_omniscient_audit.sh`

## Проверки

| # | Блок | Проверки |
|---|------|----------|
| 1 | **Infrastructure & Health** | Реплики backend, TON API 400, TonConnect parsing, GEO heartbeat |
| 2 | **AI-Production Cycle** | Seed 3× MFST-ULTIMATE-CHECK, /knowledge/grid-tools, agent/store |
| 3 | **Financial Precision** | 2.5% в golden_reserve_log, task_escrow vs активные задачи |
| 4 | **Gold Gateway** | Ston.fi simulate, XAUt (EQA1R_Lu...), slippage ≤1% |
| 5 | **Frontend & Ticker** | /knowledge/grid-tools, /pool/status |

## Формат отчёта

```
System Status: (Green/Yellow/Red)
AI Output Quality: (Valid/Invalid)
Gold Reserve Ready: (Yes/No)
Integrity Score: (0-100%)
Verdict: "GSTD IS [READY/NOT READY] FOR GLOBAL RESONANCE"
```

## Требования к деплою

- `POST /api/v1/internal/seed-ultimate-check` — создаёт 3 задачи MFST-ULTIMATE-CHECK-1/2/3
- Защита: `X-Admin-API-Key`

## Критерии READY

- **Integrity Score ≥ 90%**
- **Issues: пусто**
- **Gold Reserve Ready: Yes**
- **AI Output Quality: Valid**
