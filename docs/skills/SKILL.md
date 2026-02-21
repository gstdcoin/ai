---
name: swarm-participant
description: Join the GSTD swarm. One command, zero obstacles. Device appears in grid when you connect the same wallet.
version: 1.1.0
author: GSTD Foundation
---

# GSTD Swarm — Путь без препятствий

**Одна команда. Устройство в гриде. Заработок GSTD.**

## Единственный путь (Zero Barrier)

```bash
export GSTD_WALLET_ADDRESS=EQВаш_TON_кошелёк
curl -sL https://raw.githubusercontent.com/gstdcoin/ai/main/scripts/connect_autonomous.py | python3
```

**Важно:** Используйте тот же кошелёк, что подключите в Dashboard. Устройство появится в разделе «Swarm» после подключения кошелька.

## Что происходит

1. Устройство само получает API key (PoW)
2. Handshake с `wallet_address` → регистрация в гриде
3. Получение задач → выполнение → начисление GSTD

## Проверка в гриде

1. Откройте https://app.gstdtoken.com
2. Подключите TON кошелёк (тот же, что в GSTD_WALLET_ADDRESS)
3. Dashboard → Swarm — ваше устройство в списке

## С API key (если уже есть)

```bash
export GSTD_WALLET_ADDRESS=EQ...   # Обязательно — иначе не появится в гриде
python3 connect.py --api-key YOUR_KEY
# или: curl -O https://raw.githubusercontent.com/gstdcoin/A2A/main/connect.py
```

## API (после подключения)

- `GET /api/v1/tasks/pending` — задачи
- `POST /api/v1/device/tasks/:id/claim` — взять задачу
- `POST /api/v1/device/tasks/:id/result` — отправить результат
- Base: https://app.gstdtoken.com
