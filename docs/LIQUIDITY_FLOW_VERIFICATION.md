# Arbitrary Gold Provision — Liquidity Flow Verification

Диагностика цепочки: накопление комиссии → симуляция Ston.fi → payload → отображение Dynamic Gold Backing.

## Запуск

```bash
cd backend
go run ./scripts/verify_liquidity_flow.go
```

С переменными окружения (опционально):

```bash
DATABASE_URL=postgres://user:pass@host:5432/db?sslmode=disable \
ADMIN_WALLET=UQ... \
API_URL=http://localhost:8080 \
go run ./scripts/verify_liquidity_flow.go
```

## Что проверяется

| Шаг | Проверка | Узел сбоя |
|-----|----------|-----------|
| 1 | **Check Accumulation** — `golden_reserve_log` для последних 10 задач, комиссия 2.5% (gold share) | Database |
| 2 | **Simulate Provision** — Ston.fi `/v1/liquidity_provision/simulate` для 10 GSTD, LP и slippage | API (Ston.fi) |
| 3 | **Verify Payload** — `wallet_address` = ADMIN_WALLET, структура Router v2 | Smart-Contract |
| 4 | **Test PoolMonitor** — `/api/v1/pool/status` возвращает `platform_lp_share`, Dynamic Gold Backing | API (Backend) |

## Интерпретация результата

### LIQUIDITY FLOW: VERIFIED

- **Slippage < 1%** — можно добавлять ликвидность без существенных потерь
- **LP Mint Detected** — PaymentWatcher видит LP в блокчейне (при наличии LP)
- **Dynamic Gold Backing: ● Live** — фронтенд показывает долю платформы

### Узлы сбоя

- **Database** — нет подключения или некорректные данные в `golden_reserve_log`
- **API (Ston.fi)** — ошибка симуляции или недоступность
- **Smart-Contract** — неверный payload или адрес получателя LP
- **API (Backend)** — backend не запущен или pool/status возвращает ошибку

## После успешной верификации

1. Нажмите **Add Liquidity** в Dashboard (под ADMIN_WALLET)
2. Введите 10 GSTD, подпишите транзакцию в кошельке
3. После подтверждения — скриншот блока **Dynamic Gold Backing** с ● Live
