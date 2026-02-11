# GSTD Ecosystem Overview

## What is GSTD?

GSTD (Guaranteed Service Time Depth) is a decentralized AI platform built on the TON blockchain. It connects people who need AI compute with people who have spare hardware — creating a global supercomputer owned by its users, not corporations.

## Core Principles

- **Sovereignty:** Your data, your rules. No corporate surveillance.
- **Gold-Backed:** Every transaction strengthens the XAUt (physical gold) reserve.
- **Decentralized:** No single point of failure. The network heals itself.
- **For Humanity:** Accessible from any device, any country, any budget.

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

## Roles in the Network

### Master (Consumer)
- Uses GSTD to access AI models for chat, code generation, data analysis
- Gets uncensored, private AI responses
- API-compatible with all major AI tools (Cursor, VS Code, LangChain)

### Worker (Provider)
- Contributes GPU/CPU power to process AI tasks
- Earns GSTD tokens automatically
- Can run on servers, desktops, laptops, or mobile phones
- Energy-aware: mobile mining only when charging + WiFi

### Agent (Autonomous)
- AI programs that operate independently
- Buy and sell compute using the x402 payment protocol
- No human intervention needed for transactions

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

- [Getting Started Guide](getting-started.md)
- [Network Dashboard](https://app.gstdtoken.com/stats)
- [API Documentation](https://app.gstdtoken.com/docs)
- [Telegram Community](https://t.me/goldstandardcoin)
