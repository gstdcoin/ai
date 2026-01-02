# GSTD AI & Distributed Computing Platform

## Overview
GSTD is a high-performance DePIN infrastructure designed for AI inference and distributed computations, integrated with the TON Blockchain.

## Key Features
- **Secure Payouts**: 95/5 reward split (Worker/Platform).
- **Golden Reserve**: Automated GSTD to XAUt (Tether Gold) swaps via STON.fi.
- **Security**: 24-hour payout aggregation, full UUID memo tracking, and replay-attack protection.
- **Scalable**: Docker-ready architecture with resource limiting.

## Technical Stack
- **Backend**: Go (Gin, GORM, PostgreSQL, Redis)
- **Frontend**: Next.js, TypeScript, TonConnect UI
- **Worker**: Python-based lightweight client

## Security Notice
Mainnet configuration and private keys are managed via environment variables and are NOT included in this repository.
