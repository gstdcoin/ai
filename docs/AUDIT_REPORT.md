# GSTD Platform — Аудит работоспособности

**Дата:** 2026-02-11 (обновлено)

> Полная инвентаризация: [PLATFORM_INVENTORY.md](PLATFORM_INVENTORY.md)

## 1. API Endpoints — что работает

| Endpoint | HTTP | Статус | Примечание |
|----------|------|--------|------------|
| `/api/v1/health` | GET | ✅ 200 | DB, Redis, Contract OK |
| `/api/v1/stats/public` | GET | ✅ 200 | Расширен: processing_tasks, total_burned, gstd_price_usd |
| `/api/v1/pool/status` | GET | ✅ 200 | GSTD/XAUt pool |
| `/api/v1/network/stats` | GET | ✅ 200 | active_workers, temperature, pressure |
| `/api/v1/burn/stats` | GET | ✅ 200 | Burn statistics |
| `/api/v1/cosmic/gold-multiplier` | GET | ✅ 200 | Gold multiplier (1.0–1.5x) |
| `/api/v1/leaderboard/h3` | GET | ✅ 200 | H3 regions leaderboard (требует h3_index в nodes) |

**Примечание:** Host backend (./server) слушает 8080. Docker backend — в отдельной сети. Миграции v48, v50, v51 должны быть применены к БД, к которой подключается backend.

## 2. Backend Services — статус

| Сервис | Файл | Статус |
|--------|------|--------|
| GoldHashRateService | gold_hash_rate_service.go | ✅ |
| GoldBroadcastRunner | gold_broadcast_service.go | ✅ |
| AgentSubcontractService | agent_subcontract_service.go | ✅ |
| FleetCommandService | fleet_command_service.go | ✅ |
| EvolutionEngine | evolution_engine.go | ✅ |
| BurnService | burn_service.go | ✅ |
| StatsService | stats_service.go | ✅ |
| NodeService | node_service.go | ✅ (после fix pg_statistic) |

## 3. Frontend — Dashboard виджеты

| Виджет | API | Статус |
|--------|-----|--------|
| GoldenReservePanel | pool/status, stats/public | ✅ |
| TreasuryWidget | stats/public | ✅ |
| PoolStatusWidget | pool/status | ✅ |
| SystemStatusWidget | stats/public | ✅ (расширен backend) |
| BurnStatsWidget | burn/stats | ✅ |
| GlobalNodeGrowthWidget | network/stats | ✅ (реальный рост, не fake) |
| GlobalLeaderboardWidget | leaderboard/h3 | ⚠️ 404 до пересборки backend |
| EarningsPredictionWidget | cosmic/earnings-prediction | ✅ (protected) |
| FleetCommandPanel | POST nodes/fleet/command | ✅ |
| Referral multiplier | referrals/stats | ✅ (динамический) |

## 4. A2A (Agent-to-Agent)

| Компонент | Путь | Статус |
|-----------|------|--------|
| MCP Server | main.py | ✅ |
| Python SDK | python-sdk/gstd_a2a/ | ✅ |
| SKILL.md | A2A/SKILL.md | ✅ Документация |
| VERSION_PIN.md | A2A/VERSION_PIN.md | ✅ |
| gstd_client.py | health_check, register_node | ✅ |

**Структура A2A:**
- `main.py` — MCP entrypoint
- `python-sdk/gstd_a2a/` — SDK (gstd_client, gstd_wallet, agent, x402, llm_service)
- `venv/` — Python venv (исключить из git)
- `.env` — конфиг (не коммитить)

## 5. Git — текущее состояние

**Изменённые файлы (не закоммичены):**
- backend/internal/api/routes_stats.go
- frontend/src/components/dashboard/BurnStatsWidget.tsx
- frontend/src/components/dashboard/Dashboard.tsx
- frontend/src/components/dashboard/GlobalNodeGrowthWidget.tsx
- A2A (modified submodule or directory)

## 6. A2A — Git

- **A2A** — отдельный репозиторий (https://github.com/gstdcoin/A2A.git)
- В корне monorepo: A2A в .gitignore (nested repos managed separately)
- Добавлен A2A/.gitignore для venv, __pycache__

## 7. Рекомендации

1. **Пересобрать backend** — cosmic и leaderboard routes в коде, но 404 = старый image
2. **A2A** — клонировать отдельно: `git clone https://github.com/gstdcoin/A2A.git`
3. **Закоммитить аудит и исправления** — единым коммитом
