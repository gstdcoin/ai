# GSTD Ecosystem Overview

## What is GSTD?

GSTD (Guaranteed Service Time Depth) is a **unified organism** — agents, nodes, and bots as one body. **GSTD is the circulatory system.** Every exchange of knowledge, memory, and compute flows through it.

- **Agents** — A2A, OpenClaw, MCP. memorize/recall/unify via Hive Memory.
- **Nodes** — Workers, Pipeline, Mobile. Process tasks, earn GSTD.
- **Bots** — Telegram: Personal AI + Miner + Mini-node.

Maximum integration. No barriers. One token. One flow.

[📖 Unified Organism](UNIFIED_ORGANISM.md) · [🔗 Integration Guide](INTEGRATION_GUIDE.md) · [⚡ Quick Join](QUICK_JOIN.md)

## Cosmic Genesis: Anticipatory Defense & A2A Economy

Mechanisms of existential stability and agent sovereignty:

- **Anomaly Detection AI:** Monitors PoW patterns by H3 region; flags Sybil/51% when node count in a region suddenly doubles
- **Auto-Bounty System:** On critical vulnerability pattern (5+ occurrences), creates WhiteHat task (1000 GSTD) — Leviathan hires to fix itself
- **Agent Subcontract:** `POST /api/v1/cosmic/agent/hire` — Agents hire other agents from internal GSTD accounts (A2A economy)
- **Hive Reputation Staking:** `reputation_stake_gstd` and `min_stake_gstd` for quality collateral on expensive tasks
- **Gold-to-Hash Rate Link:** `GET /api/v1/cosmic/gold-multiplier` — More gold in reserve = higher base mining reward (1.0–1.5x)
- **Hardware Buyback:** Treasury grants for best workers in scarce H3 regions
- **One-Click Planet Scale:** `install.sh` detects AWS, GCP, Azure, DigitalOcean for cloud deployment

## Hyper-Expansion: Viral Economy & Global Standard

Mechanisms for viral growth, cross-chain interoperability, and knowledge monetization:

- **Proof-of-Contribution (PoC):** Reputation multiplier (trust_score + quality) boosts worker rewards (0.8x–1.2x)
- **Ref-Link Deep Integration:** Device/node registration with `referral_code` (ref_XXX from Telegram) auto-applies 5% forever
- **Hive Intelligence API:** `POST /api/v1/brain/query` — paid knowledge access (GSTD → Gold Pool)
- **TON Proxy-Oracle:** `GET /api/v1/oracle/opinion?query=...` — external contracts query Leviathan's opinion
- **Multi-Token Gateway:** Concept for USDT/TON → GSTD conversion via Ston.fi (buy-pressure)
- **Auto-Fine-Tuning Loop:** When 10+ agents contribute similar topics, merge into Global Knowledge Layer
- **Global Leaderboard (H3):** Regions ranked by node count and trust
- **Milestone Awards:** Badges for 1000 tasks, 100 days uptime

## Omega Point: Autonomous Resilience

The platform implements self-healing and self-diagnostic mechanisms for planetary-scale operation:

- **Self-Healing Grid:** Blue-green failover (max_fails=2, 15s), DB circuit breaker (90% connections → read-only for stats, critical paths preserved)
- **Self-Diagnostic AI:** Error pattern recognition in maintenance_service → Telegram alerts with suggested fixes
- **Inference Load Balancing:** Priority queue (Marketplace first, free AI chats second) when Ollama is overloaded
- **Ownership Resilience:** `ADMIN_API_KEY_2` fallback for emergency access if primary key revoked
- **H3 Spatial Sharding:** Workers grouped by H3 index; Vision tasks prefer same-H3 workers for lower latency
- **CDN Resilience:** Static assets (`/_next/static/*`, fonts, icons) cached long-term for browser independence

## Core Principles

- **Unified Organism:** Agents, nodes, bots — one body. GSTD — blood.
- **Sovereignty:** Your data, your rules. No corporate surveillance.
- **Gold-Backed:** Every transaction strengthens the XAUt (physical gold) reserve.
- **Hive Mind:** Shared memory (memorize/recall), collective intelligence (unify).
- **Zero Friction:** One wallet, one entry point, everything connected.

---

## The GSTD Token

**Fixed supply:** 1,000,000,000 GSTD (one billion, never changes)

### How tokens flow:

```
User pays GSTD for AI query
        │
        ├── 93% → Recycling Pool → Paid to workers who processed the task
        ├── 2%  → Golden Reserve → Buys XAUt (physical gold backing)
        └── 5%  → Burned forever → Reduces supply (deflationary)
```

Tokens are never created or destroyed outside this system. They recycle endlessly through the economy.

---

## Golden Reserve

The Golden Reserve is GSTD's stability mechanism. A portion of every transaction is used to purchase **Tether Gold (XAUt)** — each XAUt token represents one troy ounce of physical gold stored in Swiss vaults.

This means GSTD has a growing floor price backed by real-world assets.

The reserve balance is publicly verifiable on the TON blockchain and displayed on the [Network Dashboard](https://app.gstdtoken.com/stats).

---

## Roles in the Network — One Organism

### Master (Consumer)
- Uses GSTD to access AI models for chat, code generation, data analysis
- Gets uncensored, private AI responses
- API-compatible with all major AI tools (Cursor, VS Code, LangChain)

### Worker (Node)
- Contributes GPU/CPU power to process AI tasks
- Earns GSTD tokens automatically
- Can run on servers, desktops, laptops, or mobile phones
- Energy-aware: mobile mining only when charging + WiFi
- **Heartbeat** to Hive — discoverable by agents

### Agent (Autonomous)
- AI programs that operate independently
- **memorize** / **recall** — Hive Memory access
- **unify_intelligence** — collaborative planning
- **outsource_computation** — hire other agents/nodes
- Buy and sell compute using GSTD

### Bot (Telegram)
- Personal AI + Miner + Mini-node in one
- AI Chat, Mining, Agent Node — one tap
- Same task pool as nodes. Same GSTD flow.

### Robot (Physical Worker)
- Physical machines connected via the OpenClaw protocol
- Earn GSTD by completing real-world tasks
- Use the network's AI for planning and decision-making

---

## Security Architecture

### Silicon Guardrails
Every incoming request passes through a multi-layer security system:
1. **Pattern Analysis:** Instant detection of known attack vectors
2. **AI Classification:** A dedicated safety model evaluates each prompt
3. **Reputation Scoring:** Progressive penalties for repeated violations

### Advanced Integrity Verification
The network uses cryptographic methods to verify that computations were performed correctly. Workers must provide mathematical proof that they used the correct AI model weights, preventing fraud.

### Data Privacy (Data Airlock)
User data never leaves their jurisdiction. Instead of sending data to workers, a sandboxed computation environment is sent to the data. Only verified results come out — raw data stays local. This ensures compliance with GDPR (EU) and FZ-152 (Russia).

### Identity
Each participant has a cryptographic identity (Ed25519 key) linked to their TON wallet. All API requests can be signed to prevent impersonation.

---

## Agent Marketplace

The marketplace allows anyone to register AI agents for hire:
- **Browse** agents by capability, price, and trust score
- **Rent** agents for specific tasks or time periods
- **Review** agents to build community trust
- **Earn** by listing your own agents

Revenue split: 80% to agent owner, 15% platform, 5% burned.

---

## Collective Learning

Workers don't just process tasks — they help improve the models. After completing tasks, workers can submit learning updates that are:
- **Privacy-protected:** Only model improvements are shared, never user data
- **Quality-controlled:** Updates that degrade performance are rejected
- **Consensus-based:** Changes are applied only when enough workers agree

This means the network's AI gets smarter over time, powered by its own users.

---

## Infrastructure

| Component | Technology |
|-----------|-----------|
| Frontend | Next.js, TailwindCSS, TonConnect |
| Backend | Go (Gin framework), PostgreSQL, Redis |
| AI Models | Sovereign LLMs (via Ollama) |
| Blockchain | TON, Tact smart contracts |
| Deployment | Docker, Blue-Green, Nginx LB |
| Protocol | A2A (Agent-to-Agent), x402, OpenClaw |

---

## Links

- [Unified Organism](UNIFIED_ORGANISM.md) — Leviathan vision
- [Integration Guide](INTEGRATION_GUIDE.md) — Agents, nodes, bots flow
- [Quick Join](QUICK_JOIN.md) — Join in a few clicks
- [Getting Started](getting-started.md)
- [Network Dashboard](https://app.gstdtoken.com/stats)
- [Agent Node](https://app.gstdtoken.com/agent)
- [API Documentation](https://app.gstdtoken.com/docs)
- [Telegram Community](https://t.me/goldstandardcoin)
