# GSTD Contracts — Verification & State

## Контракты и их роли

| Контракт | Роль | Награды / Хранение | Золото | Комиссия |
|----------|------|--------------------|--------|----------|
| **SettlementMaster** | Экономическое ядро | 85% → Worker, 10% → Treasury, 5% → Protocol | — | 5% platform |
| **TreasuryGold** | Золотое обеспечение | — | 70% revenue → XAUt | — |
| **GSTDJetton** | Токен | Mint для workers | — | — |
| **escrow** | Escrow для задач | Хранение до завершения | — | — |

## SettlementMaster (Награды за ресурсы)

- **workerShare**: 85% — воркерам за выполнение задач
- **treasuryShare**: 10% — в TreasuryGold (золото)
- **protocolShare**: 5% — buyback & burn
- **minPayment**: 0.1 TON
- **paused**: circuit breaker

## TreasuryGold (Золотое обеспечение)

- **goldConvertRatio**: 70% входящего TON → XAUt
- **xautJetton**: адрес Tether Gold
- **dexRouter**: Ston.fi/DeDust для свопа

## GSTDJetton (Хранение для провайдеров)

- **mintAuthority**: только SettlementMaster
- **totalSupply** / **maxSupply**: 1B

## Проверка состояния

```bash
# Верификация контрактов (если есть скрипт)
cd contracts && npm run verify
```

## Безопасность

- SanitizeError: скрывает пути, credentials, stack traces
- Rate limiting: Redis, 500 req/min на network/stats
- CORS: whitelist origins
- Session: Redis, X-Session-Token

## Конфиденциальность

- wallet_address маскируется в публичных ответах (maskWallet)
- Ошибки не раскрывают внутренние данные

## Узкие места и митигация

| Область | Риск | Митигация |
|---------|------|-----------|
| TON API | Rate limit 429 | Ротация ключей (TONAPIKeys), кеш балансов |
| Redis | Отказ | Graceful fallback, rate limiter skip |
| DB | Перегрузка | DBCircuitBreaker при 90% connections |
| Ston.fi | Недоступность | Fallback на golden_reserve_log для цены |
| Chat | Токены | Free tier 5 req/day, rate limit |
