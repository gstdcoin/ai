# GSTD A2A — Active Connection Data

For [github.com/gstdcoin/A2A](https://github.com/gstdcoin/A2A) and any device connecting to the swarm.

## Endpoints (Live)

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `https://app.gstdtoken.com/api/v1/system/integrity` | GET | None | Genesis manifest hash for Sentinel verification |
| `https://app.gstdtoken.com/api/v1/agents/handshake` | POST | X-API-Key (optional) | Register device, get agent_id |
| `https://api.gstdtoken.com/api/v1/*` | * | Session / API Key | Full API (same as app when proxied) |

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

After handshake, devices appear in Dashboard → Swarm (merged with nodes from /nodes/my and /devices/my).

## Scale Goal

- 10%+ of world's PCs in swarm
- 10%+ of flagship mobile devices
- Quality maintained via server fallback when swarm is small
