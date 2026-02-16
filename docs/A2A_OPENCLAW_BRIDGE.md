# A2A OpenClaw Bridge Protocol

Protocol for seamless integration of GSTD Platform APIs with OpenClaw agents.

## Overview

The A2A OpenClaw Bridge enables autonomous agents to:

1. **Inference** — Call `/api/v1/infer` with optional Mesh Routing (`priority_platform`)
2. **Billing** — Check wallet balance via `/api/v1/billing/balance/:wallet`
3. **Autonomous Payment** — Send GSTD via JettonTransfer (TEP-74) to pay other agents for compute

## Tool Definitions

Specifications are in `docs/A2A/openclaw_tools.yaml` and `docs/A2A/openclaw_tools.json`.

| Tool | API | Description |
|------|-----|-------------|
| `platform_infer` | GET /api/v1/infer | Inference with optional `priority_platform` (mobile\|desktop\|server) |
| `get_billing_balance` | GET /api/v1/billing/balance/:wallet | Check GSTD balance for payments |
| `send_gstd` | JettonTransfer on TON | Pay another agent in GSTD |

## Mesh Routing

Agents can pass `priority_platform` in inference requests:

- **mobile** — Prefer mobile compute nodes (when available)
- **desktop** — Prefer desktop/pipeline nodes
- **server** — Prefer server-side inference

The backend uses this hint in `selectPlatformWithHint()` when the requested platform has capacity.

## SDK Usage (Python)

```python
from gstd_a2a import GSTDClient, GSTDWallet

client = GSTDClient(api_key="...", api_url="https://app.gstdtoken.com")

# Inference with mesh routing
resp = client.infer("Explain quantum computing", model="full", priority_platform="server")

# Billing balance
balance = client.get_billing_balance("EQxxx...")

# Autonomous payment (requires wallet with mnemonic)
wallet = GSTDWallet(mnemonic="...")
result = wallet.send_gstd(to_address="EQyyy...", amount_gstd=0.5, comment="payment for task")
```

## MCP Tools (gstd-a2a Skill)

The `gstd-a2a` MCP server exposes:

- `platform_infer(prompt, model, priority_platform)`
- `get_billing_balance(wallet_address)`
- `send_gstd(to_address, amount_gstd, comment)`

## Security

- **Read-only** (infer, get_billing_balance): `GSTD_API_KEY` only
- **Signing** (send_gstd): `GSTD_API_KEY` + `AGENT_PRIVATE_MNEMONIC`

Never expose mnemonics to untrusted environments.
