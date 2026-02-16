# Infrastructure Supremacy Protocol

**Видение**: GSTD Platform — шлюз к глобальной сети с собственным центром управления. Дашборд переносится на устройства пользователей. Главная страница — общая информация о сети, графики и визуализация в реальном времени. Под капотом — сеть и думающая модель, собравшая лучшее из всех моделей, обучающаяся непрерывно.

## Архитектура

```
┌─────────────────────────────────────────────────────────────────┐
│                    GSTD Platform (Gateway)                        │
├─────────────────────────────────────────────────────────────────┤
│  Main Page: 3D Swarm + Gold Backing Visualization (Real-time)    │
│  API Gateway: GSTD Balance Auth → No tokens = Become Node CTA    │
│  Dual-Mode: Consumer ↔ Provider (Seamless Transition)             │
└─────────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────────────┐
│ Local Dashboard│   │ Local Dashboard│   │ Admin Master-Dashboard│
│ (User Node)    │   │ (User Consumer)│   │ (Architect)           │
│ Earn GSTD     │   │ Pay GSTD/API   │   │ Network Health       │
│ Share compute │   │ Use API        │   │ Emission/Commission   │
└───────────────┘   └───────────────┘   └───────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌─────────────────────────────────────────────────────────────────┐
│           Decentralized Model Hub (IPFS + GSTD Storage)          │
│           LLM weights distributed across the network              │
└─────────────────────────────────────────────────────────────────┘
```

## Реализовано (v1)

| Компонент | Статус | Файлы |
|-----------|--------|-------|
| API-as-a-Service | ✅ | `middleware_gstd_gateway.go`, `routes_infrastructure_supremacy.go`, `brain/query` + RequireGSTDBalance |
| Dual-Mode Switcher | ✅ | `SovereignSwitch.tsx` — auto-switch по балансу, CTA "Become Node" |
| Decentralized Model Hub | ✅ | `v60_infrastructure_supremacy.sql` — таблица `model_storage` |
| Global Visualization | ✅ | `SwarmVisualization.tsx` — canvas-визуализация на главной |
| Admin Architect | ✅ | `/admin/architect`, `getAdminArchitectNetwork`, `getAdminArchitectParams` |

## Компоненты

### 1. API-as-a-Service
- **Шлюз авторизации**: баланс GSTD на кошельке
- **Нет токенов** → 402 Payment Required + CTA "Стать Нодой"
- **API Key** → привязан к кошельку, списание GSTD за запросы

### 2. Dual-Mode Switcher (Seamless Transition)
- **Consumer** (Sovereign Master): тратит GSTD на API
- **Provider** (Hive Worker): зарабатывает GSTD, делится ресурсами
- **Автоматический переход**: баланс < порог → мгновенно в режим Ноды
- **Локальный дашборд**: управление узлами, API ключи

### 3. Decentralized Model Hub
- **IPFS**: хранение весов моделей
- **GSTD Storage Layer**: метаданные, индексация, доступ
- **Провайдеры LLM**: выгодно хранить и обучать модели через сеть

### 4. Global Visualization Layer
- **Главная страница**: 3D визуализация роя и золотого обеспечения
- **Реальное время**: активность нод, потоки данных, резерв

### 5. Admin Master-Dashboard (Архитектор)
- **Локальный интерфейс**: мониторинг здоровья сети
- **Управление**: эмиссия, комиссии, параметры
