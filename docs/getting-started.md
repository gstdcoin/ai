# Getting Started with GSTD Platform

## For Users (AI Chat)

1. **Open** [app.gstdtoken.com](https://app.gstdtoken.com)
2. **Connect** your TON wallet (Tonkeeper, TonHub, or any TonConnect wallet)
3. **Start chatting** — the AI responds instantly via sovereign LLM models

Your queries are processed by decentralized compute nodes. No data is stored. No censorship.

**Cost:** Each query costs a small amount of GSTD tokens. New users receive a welcome bonus.

---

## For Workers (Earn GSTD)

### Desktop / Server (Recommended)

```bash
curl -fsSL https://app.gstdtoken.com/install.sh | bash
```

This script will:
- Detect your system (Linux/macOS/Windows WSL)
- Install required software (Docker, Ollama)
- Pull AI models optimized for your hardware
- Register your device as a compute node
- Start earning GSTD automatically

**Requirements:** 8GB+ RAM, modern CPU. GPU optional but increases earnings.

### Mobile (Telegram)

1. Open the GSTD Telegram Bot
2. Tap **Start Mining**
3. Your phone processes lightweight tasks in the background

Mining only runs when charging + WiFi connected to protect your device.

---

## For Developers (API Access)

GSTD offers an **OpenAI-compatible API**. Any tool that supports OpenAI can use GSTD.

```bash
# Generate an API key in your Dashboard → Sovereign Switch → API Gateway
curl https://api.gstdtoken.com/v1/chat/completions \
  -H "Authorization: Bearer gstd_YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gstd-sovereign",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

**Compatible with:** Cursor, VS Code Copilot, LangChain, AutoGPT, CrewAI, and any OpenAI SDK client.

### Available Models

| Model | Speed | Quality | Cost |
|-------|-------|---------|------|
| `gstd-fast` | Instant | Good | 0.01 GSTD |
| `gstd-sovereign` | Fast | Excellent | 0.05 GSTD |
| `gstd-ultra` | Moderate | Best | 0.10 GSTD |

---

## For Robots (OpenClaw Protocol)

Physical robots and IoT devices can connect via JSON-RPC:

```python
import httpx

# Register your robot
response = httpx.post("https://api.gstdtoken.com/v1/openclaw/rpc", json={
    "jsonrpc": "2.0",
    "method": "claw.register",
    "params": {
        "wallet_address": "EQ...",
        "agent_type": "manipulator",
        "capabilities": ["pick_and_place", "inspect"]
    },
    "id": 1
})

# Fetch available physical tasks
tasks = httpx.post("https://api.gstdtoken.com/v1/openclaw/rpc", json={
    "jsonrpc": "2.0",
    "method": "claw.getAvailableTasks",
    "params": {},
    "id": 2
})
```

Robots earn GSTD for completed physical tasks. Rewards are credited automatically.

---

## Useful Links

- **Dashboard:** [app.gstdtoken.com](https://app.gstdtoken.com)
- **API Gateway:** [api.gstdtoken.com/v1](https://api.gstdtoken.com/v1)
- **Network Stats:** [app.gstdtoken.com/stats](https://app.gstdtoken.com/stats)
- **API Specification:** [openapi.yaml](../openapi.yaml)
- **Telegram:** [t.me/goldstandardcoin](https://t.me/goldstandardcoin)
