<div align="center">

# GSTD — DePIN & AI Network with Gold Backing

**Global Super Computer / Guaranteed Service Time Depth**

GSTD combines decentralized computing (DePIN) with real-world asset backing (Gold). We aggregate idle smartphone power to run AI inference (SLM) and back the network's value with physical gold (XAUt).

[![License: MIT](https://img.shields.io/badge/License-MIT-violet.svg)](LICENSE)
[![TON](https://img.shields.io/badge/Blockchain-TON-blue.svg)](https://ton.org)
[![Gold Backed](https://img.shields.io/badge/Reserve-XAUt_Gold-gold.svg)](#golden-reserve)
[![OpenAI Compatible](https://img.shields.io/badge/API-OpenAI_Compatible-green.svg)](#api)

[Dashboard](https://app.gstdtoken.com) · [Agent Node](https://app.gstdtoken.com/agent) · [API Docs](https://app.gstdtoken.com/docs) · [Telegram](https://t.me/goldstandardcoin) · [OpenAPI](openapi.yaml)

</div>

---

## 🏛️ Architecture Overview

The system operates as a unified organism across three layers:
1.  **Compute Layer (DePIN)**: Millions of smartphones running "Worker Nodes" via Telegram Mini App.
2.  **Financial Core (DeFi + RWA)**:
    *   **Escrow 2.0**: 95% of task budget is paid to workers; 5% platform fee.
    *   **Treasury**: Automatically converts 70% of Net Protocol Revenue into **Tether Gold (XAUt)**.
    *   **Lending**: Borrow stablecoins against GSTD at 1.5% APY (60% LTV).
3.  **Multichain Liquidity**:
    *   **TON**: Main entry point, Telegram integration, Worker rewards.
    *   **Solana**: High-frequency trading & DePIN data layer.
    *   **XRPL**: Institutional settlements & CBDC bridge.

## 📱 Wallet-as-Node (Mining)

*   **Platform**: Telegram Mini App (TMA).
*   **One-Click Mining**: Users click "Start Worker". The app uses `MobileComputeService` to run AI tasks.
*   **Energy Aware**: Only runs when charging, on Wi-Fi, and battery temp < 40°C.
*   **Rewards**: Paid in GSTD, backed by real-time gold purchases.

## 💰 Economics & Gold Backing

The `TreasuryService` runs autonomously:
1.  **Fee Collection**: 5% of every task goes to the platform.
2.  **Gold Purchase**: When fees accumulate, the system automatically swaps **GSTD -> XAUt** via Ston.fi.
3.  **Nightly Audit**: A cryptographic audit runs every day at 00:00 UTC (`cmd/nightly_audit`), verifying:
    *   Total GSTD Supply vs. Treasury XAUt Holdings.
    *   Publishes the "Gold Backing Ratio" to the blockchain.

## 🛠️ Tech Stack

| Component | Technology | Purpose |
|-----------|------------|---------|
| **Frontend** | Next.js, Telegram TMA SDK | User Interface, Worker Dashboard |
| **Backend** | Go (Gin), PostgreSQL, Redis | Task Orchestration, Payments, Treasury |
| **AI Workloads** | ONNX Runtime (Web/Mobile) | SLM Inference (e.g., Llama-3-8B-Quant) |
| **Blockchain** | TON (Tact), Solana (Rust), XRPL | Payments, Escrow, Asset Management |

## 🚀 Quick Start

### Self-Hosting

```bash
git clone https://github.com/gstdcoin/ai.git
cd ai
cp .env.example .env
docker compose up -d
```

### Run Nightly Audit Manually

```bash
go run backend/cmd/nightly_audit/main.go
# Output: ✅ Nightly Audit Complete: Supply=1000000 GSTD, Reserve=10.5 XAUt
```

## 🤝 Contribution

1. Fork the repo
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License
MIT
