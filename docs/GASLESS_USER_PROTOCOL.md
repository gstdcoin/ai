# Gasless User Protocol

**Status**: Active  
**Config**: `gasless_user: true` in `/api/v1/config`

## Overview

Gasless User removes friction for new users and workers by subsidizing gas and enabling instant GSTD→TON swap.

## 1. Subsidized Onboarding

- **Source**: Protocol_Fund (5% from settlement_ledger)
- **Beneficiaries**: First 5000 new users
- **Amount**: 0.05 TON per user (for wallet linking gas)
- **Trigger**: Login or device registration with new wallet
- **API**: Automatic on `POST /api/v1/users/login` or `POST /api/v1/devices/register`

## 2. Highload Batching (Highload Ascension)

- **Target**: SettlementService payouts
- **Batch size**: Min 50 workers per 1 gas transaction
- **Contract**: Highload Wallet V3 (tonutils-go)
- **Service**: `PayoutBatchService` + `HighloadWalletService`
- **Method**: `SignAndBroadcastBatch` — sends up to 255 TON transfers in 1 tx
- **Config**: `HIGHLOAD_WALLET_SEED` (24 words), `LITESERVER_CONFIG_URL`
- **Status**: TON batch ready; GSTD Jetton batch requires `SignAndBroadcastGSTDBatch` (TODO)

## 3. Internal Swap

- **Purpose**: User needs TON for withdrawal gas
- **Flow**: User gives GSTD → Platform sends TON from reserve
- **Rate**: ~0.02 TON per 1 GSTD (configurable)
- **Min**: 0.1 GSTD
- **API**: `POST /api/v1/swap/gstd-for-ton` (protected)
- **Body**: `{"gstd_amount": 1.0}`

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/v1/gasless/status` | Public | Subsidy count, limit, swap availability |
| POST | `/api/v1/swap/gstd-for-ton` | Session | Exchange GSTD for TON |

## TON API Validation (Highload Ascension)

- **Limits**: tonapi.io Free 10/s, Plus 25/s, Advanced 100/s
- **Rotation**: Set `TON_API_KEYS=key1,key2,key3` for rotation on 429
- **Liteserver**: Highload uses direct Liteserver (no tonapi.io for batch)

## Bot Synergy

- **Telegram link**: `POST /api/v1/telegram/bot/link` returns `subsidized: true` when user received gas
- **Bot message**: "Твой вход субсидирован. У тебя есть TON для первой операции!"

## Requirements

- **Platform wallet**: `PLATFORM_WALLET_ADDRESS` + `PLATFORM_WALLET_PRIVATE_KEY` for sending TON
- **Protocol fund**: Accumulated from settlement protocol_amount (5%)

## Migration

`v72_gasless_user.sql` creates:
- `protocol_fund` in platform_funds
- `gasless_subsidies` table
- `internal_swaps` table
- `payout_batch_queue` table
