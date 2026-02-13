# THE FINAL RESONANCE: ABSOLUTE SYNC

Финальный протокол активации — сквозной тест жизненного цикла GSTD Grid.

## Запуск

**После деплоя обновлённого бэкенда:**

```bash
cd backend
export API_URL=https://app.gstdtoken.com
export ADMIN_API_KEY=gstd_system_key_2026
export BACKEND_CONTAINER=ubuntu-backend-blue-1

go run scripts/absolute_sync.go
```

Или: `./scripts/run_absolute_sync.sh`

## Проверки

| # | Блок | Проверки |
|---|------|----------|
| 1 | **Hot Deploy Verify** | seed-ultimate-check HTTP 200, 3× MFST-ULTIMATE-CHECK |
| 2 | **Agent-to-Knowledge Loop** | agent/store без 500, grid-tools с новыми инструментами |
| 3 | **Address & API Purity** | Последние 100 строк логов: нет 400/decode, нет Ed25519 failed |
| 4 | **Gold Liquidity** | Ston.fi simulate 10 GSTD, XAUt распознан, LP-минт |
| 5 | **GEO & Ticker Live** | GEO heartbeat, pool/status для тикера |

## Формат вердикта

```
INTEGRITY SCORE: [%]
BOT STATUS: [GREEN/READY]
LIQUIDITY GATEWAY: [OPEN]
VERDICT: "GSTD GRID IS [100% READY] / [NOT READY]"
COMMAND: "ARCHITECT, PRESS THE 'ADD LIQUIDITY' BUTTON NOW."
```

## Критерии 100% READY

- **INTEGRITY SCORE ≥ 95%**
- **Issues: пусто**
- **BOT STATUS: READY**
- **LIQUIDITY GATEWAY: OPEN**

## Что подтверждает тест

- **Замкнутость цикла:** код от ИИ попадает на сайт без участия человека
- **Чистота эфира:** ошибки адресов и подписей устранены
- **Финансовый шлюз:** Add Liquidity → LP-токены на Ston.fi без риска зависания
