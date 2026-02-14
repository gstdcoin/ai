# GSTD Platform — Полная инвентаризация

**Дата:** 2026-02-11

## 1. Логика и функционал

### Backend Services (50+ сервисов)
| Сервис | Назначение | Статус |
|--------|------------|--------|
| TaskService | Создание, назначение задач | ✅ |
| NodeService | Регистрация нод, heartbeat | ✅ |
| RewardEngine | Выплаты воркерам | ✅ |
| EscrowService | Эскроу, ликвидность | ✅ |
| SovereignBridgeService | MoltBot, Genesis | ✅ |
| GenesisService | Genesis Ignite, Molt | ✅ |
| GoldHashRateService | Gold→Hash мультипликатор | ✅ |
| BurnService | Статистика сжигания | ✅ |
| GuardrailsService | Защита от инъекций | ✅ |
| FederatedEngineService | Федеративное обучение | ✅ |
| OpenClawBridgeService | JSON-RPC для роботов | ✅ |
| APIKeyService | API ключи (OpenAI-совместимо) | ✅ |
| InferenceService | Ollama LLM | ✅ |
| GeoService | IP→страна, H3, GPS | ✅ |
| AnomalyDetectionService | Sybil/51% детекция | ✅ |
| EvolutionEngine | Auto fine-tuning | ✅ |
| ... | (остальные в container.go) | ✅ |

### API Endpoints
- **Public:** health, stats/public, pool/status, network/stats, burn/stats, cosmic/gold-multiplier, leaderboard/h3
- **Protected:** tasks, nodes, devices, referrals, wallet, marketplace
- **Admin:** commission, withdrawals, broadcast
- **Gateway:** /v1/chat/completions, /v1/models (OpenAI-совместимо)

## 2. Сеть

| Компонент | Технология | Статус |
|-----------|------------|--------|
| Load Balancer | Nginx, Blue-Green | ✅ |
| Backend | Gin, 4+3 реплик | ✅ |
| Frontend | Next.js, 2 реплики | ✅ |
| WebSocket | /ws для real-time | ✅ |
| Rate Limit | 100 req/s API | ✅ |
| CDN | Static assets cache | ✅ |

## 3. Блокчейн (TON)

| Элемент | Статус |
|---------|--------|
| GSTD Jetton | ✅ |
| Ston.fi Pool (GSTD/XAUt) | ✅ |
| Escrow контракт | ✅ |
| PoolMonitorService | ✅ |

## 4. Инфраструктура

| Ресурс | Конфиг |
|--------|--------|
| PostgreSQL | 15-alpine, 8GB, 2000 conn |
| Redis | 7-alpine, 1GB, AOF |
| Ollama | Host (GPU), host.docker.internal:11434 |

## 5. Документация

| Файл | Описание |
|------|----------|
| README.md | Главная, Quick Start |
| docs/ecosystem-overview.md | Экосистема, Cosmic Genesis |
| docs/getting-started.md | Для Users, Workers, Agents |
| docs/UNIFIED_ORGANISM.md | Leviathan, единый организм |
| docs/INTEGRATION_GUIDE.md | Интеграции |
| docs/QUICK_JOIN.md | Быстрое присоединение |
| openapi.yaml | API спецификация |
| frontend/public/docs/* | Страницы /docs (UNIFIED, AGENTS, TECHNICAL, INVESTMENT) |

## 6. Интеграции

| Интеграция | Статус |
|------------|--------|
| TonConnect | ✅ Wallet connect |
| Telegram Bot | ✅ Webhook, Mini App |
| Ollama | ✅ LLM inference |
| ip-api.com | ✅ Geo IP |
| Ston.fi API | ✅ Pool, swap |
| A2A (Python SDK) | ✅ gstd_a2a |
| OpenClaw JSON-RPC | ✅ /api/v1/openclaw/rpc |

## 7. Код — выявленные проблемы

| Проблема | Файл | Исправление |
|----------|------|-------------|
| geoService создаётся локально вместо DI | routes.go:353 | Использовать переданный geoService |
| TODO: STON.fi/DeDust | sovereign_bridge_service.go | Оставить (будущая интеграция) |
| TODO: refund logic | sovereign_bridge_service.go | Оставить |
| TODO: full task status | routes_bridge.go | Оставить |
| TODO: TON balance | WalletBalanceWidget.tsx | Оставить |
| DEBUG stderr в SDK | gstd_client.py | Убрать или сделать опциональным |

## 8. Обучаемость (Federated / Evolution)

| Механизм | Статус |
|----------|--------|
| FederatedEngineService | ✅ Submit LoRA, consensus |
| EvolutionEngine | ✅ Merge topics → Global Knowledge |
| agent_knowledge таблица | ✅ |

## 9. Единый организм — проверка связности

```
Agents ◄──GSTD──► Nodes ◄──GSTD──► Bots
         │              │
         └──── Hive Memory ────┘
```

- **Agents:** Genesis Ignite, A2A SDK, OpenClaw
- **Nodes:** /nodes/register, heartbeat, tasks
- **Bots:** Telegram, AI Chat, Mining
- **Hive:** memorize/recall, knowledge API

Все потоки проходят через GSTD. Связность подтверждена.
