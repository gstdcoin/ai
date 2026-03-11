# GSTD Swarm × Bitchat — Offline Mesh Integration

[bitchat](https://bitchat.free/) — decentralized P2P messenger over **Bluetooth mesh**. No internet, no servers, no phone numbers.

GSTD Swarm integrates bitchat as **offline transport** for nodes in physical proximity.

---

## Why

| Scenario | Solution |
|----------|----------|
| Internet down | bitchat — mesh over Bluetooth |
| Protests, disasters | Network works without infrastructure |
| Limited access | Nodes relay across multiple hops |
| Censorship | No centralized servers |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    GSTD SWARM (Online)                       │
│  app.gstdtoken.com  │  Tasks  │  Hive  │  GSTD Economy       │
└─────────────────────────────────────────────────────────────┘
                              │
                    ┌─────────┴─────────┐
                    │   Bridge Node     │  ← Has internet
                    │  (bitchat + API)  │
                    └─────────┬─────────┘
                              │ Bluetooth Mesh
         ┌────────────────────┼────────────────────┐
         ▼                    ▼                    ▼
   ┌──────────┐         ┌──────────┐         ┌──────────┐
   │ Node A   │◄───────►│ Node B   │◄───────►│ Node C   │
   │ Offline  │ bitchat │ Offline  │ bitchat │ Offline  │
   └──────────┘         └──────────┘         └──────────┘
```

---

## Swarm-over-Bitchat Protocol

Messages in bitchat — JSON, prefix `gstd:` for swarm.

### Message Types

| Type | Payload | Description |
|------|---------|-------------|
| `gstd:task` | task_id, type, reward, payload | Task to execute |
| `gstd:result` | task_id, device_id, result | Result (for relay to bridge) |
| `gstd:status` | device_id, wallet, capabilities | Node heartbeat |
| `gstd:recall` | topic, query | Hive query (via bridge) |

### Format

```json
{
  "v": 1,
  "type": "gstd:task",
  "ts": 1737500000,
  "payload": {
    "task_id": "uuid",
    "task_type": "AI_INFERENCE",
    "reward_gstd": 0.05,
    "payload": {"prompt": "..."}
  }
}
```

---

## Usage

### 1. Install bitchat

- **iOS/macOS:** [App Store — bitchat mesh](https://apps.apple.com/app/bitchat-mesh) | [GitHub](https://github.com/permissionlesstech/bitchat)
- **Android:** [Play Store — bitchat](https://play.google.com/store/apps/details?id=...) | [GitHub](https://github.com/permissionlesstech/bitchat-android)

### 2. Bridge node (with internet)

Node with API access and bitchat:
- Fetches tasks via `GET /tasks/pending`
- Broadcasts to bitchat mesh
- Collects results from bitchat and submits `POST /device/tasks/:id/result`

### 3. Offline nodes

- Receive `gstd:task` from bitchat
- Execute (inference, compute)
- Send `gstd:result` back to mesh
- Bridge delivers to API when connectivity returns

---

## GSTD Integration

| Action | Online | Offline (bitchat) |
|--------|--------|-------------------|
| Get task | GET /tasks/pending | gstd:task in mesh |
| Claim task | POST /device/tasks/:id/claim | Local claim by task_id |
| Submit result | POST /device/tasks/:id/result | gstd:result → bridge → API |
| Balance | GET /users/balance | Cache + sync when online |

**Rewards:** Credited when result is delivered via bridge. Wallet in `gstd:status` and `gstd:result`.

---

## Security

- **Signature:** payload signed by wallet (Ed25519), verified on bridge
- **Replay:** ts + nonce in message
- **Max size:** bitchat limits message size — compress payload

---

## Status

- **Protocol:** Spec ready
- **Bridge:** Reference implementation — planned
- **bitchat:** [bitchat.free](https://bitchat.free/) — Public Domain

---

*GSTD Foundation × [permissionlesstech](https://bitchat.free/)*
