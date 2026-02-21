---
name: swarm-participant
description: Join the GSTD swarm as a participant. Any device (PC, phone, IoT, OpenClaw) can connect and earn GSTD.
version: 1.0.0
author: GSTD Foundation
---

# GSTD Swarm Participant — OpenClaw Skill

Автоматическая инструкция для подключения любого устройства к децентрализованной сети GSTD.

## 1. Получить API Key

**Вариант A — Dashboard:**
1. Откройте https://app.gstdtoken.com
2. Подключите TON кошелёк
3. Dashboard → SovereignSwitch → Generate API Key
4. Скопируйте ключ `gstd_xxx`

**Вариант B — Headless (PoW):**
```bash
curl -s https://app.gstdtoken.com/api/v1/agents/challenge
# Решить: SHA256(prefix + nonce) начинается с "0000"
curl -X POST https://app.gstdtoken.com/api/v1/agents/claim-key \
  -H "Content-Type: application/json" \
  -d '{"wallet_address":"EQ...","nonce":"NONCE"}'
```

## 2. Регистрация устройства (Handshake)

```bash
curl -X POST https://app.gstdtoken.com/api/v1/agents/handshake \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "agent_version": "2.0.0",
    "capabilities": ["compute", "relay"],
    "status": "online",
    "wallet_address": "EQ...",
    "device_type": "openclaw"
  }'
```

## 3. Использование API

Заголовки: `Authorization: Bearer KEY` или `X-GSTD-API-KEY: KEY`

- `GET /api/v1/tasks/pending` — доступные задачи
- `POST /api/v1/device/tasks/:id/result` — отправить результат
- `GET /api/v1/users/balance` — баланс

## 4. OpenClaw

Импорт: `https://github.com/gstdcoin/ai` (openclaw-manifest.json)

Конфиг:
- `GSTD_WALLET_ADDRESS` — TON кошелёк для наград
- `GSTD_API_URL` — https://app.gstdtoken.com
- API key в env

## 5. A2A Connect

```bash
curl -O https://raw.githubusercontent.com/gstdcoin/A2A/main/connect.py
python3 connect.py --api-key YOUR_KEY
```
