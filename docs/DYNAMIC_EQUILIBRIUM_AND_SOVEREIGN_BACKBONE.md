# Dynamic Equilibrium & Sovereign Backbone Protocols

## Dynamic Equilibrium

### 1. Anti-Price Barrier
- **Цель**: Вход в сеть не более $0.01 за микро-запрос
- **Реализация**: Каждые 24 часа `DynamicEquilibriumService` корректирует `BaseInferenceFee` относительно курса GSTD/XAUt
- **Формула**: `baseFeeGSTD = 0.01 / gstdPriceUSD`, ограничено 0.001–0.1 GSTD
- **Хранение**: `inference_fee_config` (DB)
- **Использование**: `inferenceFeeGSTD()` в UniversalMeshService

### 2. Shard Distribution
- **Цель**: Равномерное распределение критических шардов между континентами (NA, EU, AS, SA, AF, OC)
- **Таблицы**: `model_storage` (continent, region), `model_shard_replicas`
- **Сервис**: `ShardDistributionService` — проверка представленности континентов

## Sovereign Backbone

### 3. Global Load Balancing
- **Цель**: Минимизация задержки при запросах к Brain API — выбор узлов с наилучшим пингом к потребителю
- **Реализация**: `LoadBalancer.SelectWorkerForBrainRequest(ctx, consumerH3Index, minTrust)` — предпочитает воркеров с тем же H3 (регион потребителя)

### 4. Shard Integrity Watchdog
- **Цель**: Автоматическая проверка доступности шардов; при < 80% — повышение вознаграждения
- **Реализация**: Каждые 15 мин `DynamicEquilibriumService.RunShardIntegrityWatchdog()` проверяет `model_shard_replicas`, записывает `shard_reward_boosts`

### 5. Architect's Vision
- **Эндпоинт**: `GET /admin/architect/vision`
- **Метрики**: Node Influx (7d), Tasks Completed (7d), Projected Nodes (30d), **Estimated IQ Growth (30d)**
- **Формула**: IQ = tasks completed (прокси коллективного интеллекта); прогноз на 30 дней по текущему притоку нод
