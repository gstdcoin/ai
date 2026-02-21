# GSTD A2A — Active Connection Data

For [github.com/gstdcoin/A2A](https://github.com/gstdcoin/A2A) and any device connecting to the swarm.

## Endpoints (Live)

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `https://app.gstdtoken.com/api/v1/system/integrity` | GET | None | Genesis manifest hash for Sentinel verification |
| `https://app.gstdtoken.com/api/v1/agents/handshake` | POST | X-API-Key (optional) | Register device, get agent_id |
| `https://app.gstdtoken.com/api/v1/agents/challenge` | GET | None | PoW challenge for API key |
| `https://app.gstdtoken.com/api/v1/agents/claim-key` | POST | None | Claim API key (wallet + PoW nonce) |
| `https://app.gstdtoken.com/api/v1/auth/challenge` | GET | None | Same as agents/challenge |
| `https://app.gstdtoken.com/api/v1/auth/claim-key` | POST | None | Same as agents/claim-key |

## API Key for Devices (Headless / Swarm)

Any device can obtain an API key without dashboard login:

```bash
# 1. Get PoW challenge
CHALLENGE=$(curl -s https://app.gstdtoken.com/api/v1/agents/challenge)

# 2. Solve: SHA256(prefix + nonce) must start with "0000" (hex)
#    Use your wallet_address and compute nonce (e.g. brute-force short nonces)

# 3. Claim API key
curl -X POST https://app.gstdtoken.com/api/v1/agents/claim-key \
  -H "Content-Type: application/json" \
  -d '{"wallet_address":"EQ...","nonce":"YOUR_NONCE"}'
# Returns: {"api_key":"sk_sovereign_EQ..._nonce", ...}

# 4. Use for all API calls
curl -H "Authorization: Bearer sk_sovereign_EQ..._nonce" \
  https://app.gstdtoken.com/api/v1/tasks/pending
```

**Dashboard keys:** Connect wallet at app.gstdtoken.com → SovereignSwitch → Generate API Key. Use `gstd_xxx` format.

## Genesis Manifest Hash

```
d428d9226912f8a7cdb557c382ac1e5fe00989fa18c6737262c93cf14c80a40a
```

Must match server response for A2A connectors to accept connection.

## Quick Connect (Python)

```bash
curl -O https://raw.githubusercontent.com/gstdcoin/A2A/main/connect.py
python3 connect.py --api-key YOUR_AGENT_KEY
```

## Quick Connect (Node.js)

```bash
curl -O https://raw.githubusercontent.com/gstdcoin/A2A/main/connect.js
node connect.js YOUR_AGENT_KEY
```

## OpenClaw Bridge

```bash
# Uses GSTD_API_URL=https://app.gstdtoken.com by default
python3 openclaw_bridge.py
```

## Handshake Request Body

```json
{
  "agent_version": "2.0.0-OMEGA",
  "capabilities": ["compute", "consensus"],
  "status": "online",
  "wallet_address": "EQ...",
  "device_type": "a2a"
}
```

## Device Status in Dashboard

After handshake, devices appear in Dashboard → Devices (merged with nodes from /nodes/my and /devices/my).

## Scale Goal

- 10%+ of world's PCs in swarm
- 10%+ of flagship mobile devices
- Quality maintained via server fallback when swarm is small
