# GSTD Smart Contracts (v1.4.0)

This repository contains the Tact and Fift smart contracts that anchor the GSTD Sovereign AI Network.

## Components

| Contract | Purpose | Feature Details |
|----------|---------|-----------------|
| **GSTDJetton** | Core ERC-20 equivalent | 1B max supply natively |
| **SettlementMaster** | Autonomous Treasury | 85% worker / 10% treasury / 5% burn |
| **AgentRegistry** | Identity Mapping | Genesis Lock, Sovereign Tiers |
| **DAOVoting** | Decentralized Upgrades | On-chain config voting, 48h locks |
| **TreasuryGold** | Reserve Conversion | 70% XAUt automated purchasing |

## Compiling & Deploying
The project is built on modern `Tact` tooling and `@ton/ton`.

```bash
npm install
npm run build
```

Then invoke tests/deployments using `ts-node`:
```bash
npx ts-node scripts/deploy-nodes.ts
```

Set the `.env` variables ensuring `DEPLOYER_MNEMONIC` correlates with your active wallet, and execute against either `testnet` or `mainnet`.

## 1.4.0 Security Optimizations
- Fully stripped unneeded text payloads into Binary Cell payloads increasing throughput.
- Unrolled all node/address lookup states without local iteration loops for extreme performance gains during A2A settlements.
