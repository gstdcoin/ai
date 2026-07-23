# GSTD Platform — Functionality Inventory & Technical Debt
*Generated 2026-05-27*

---

## ✅ What Works (Production-Ready)

### AI Inference
| Feature | Status | Notes |
|---------|--------|-------|
| `/chat` AI page | ✅ | Routes to GSTD nodes via `lib/nodes.ts` |
| `POST /api/v1/chat/completions` | ✅ | OpenAI-compatible, no Groq |
| Node heartbeat / swarm | ✅ | Pi node sends 30s heartbeats |
| Telegram AI chat (`@GstdAppBot`) | ✅ | Bot running on Pi, webhook handler on Vercel |

### Token Economics
| Feature | Status | Notes |
|---------|--------|-------|
| `GET /api/v1/sovereign/tokenomics` | ✅ | Burn rate = 0, all fees → node operators |
| `GET /api/v1/burn/stats` | ✅ | Returns 0 (burning disabled by design) |
| `GET /api/v1/sovereign/staking/info` | ✅ | APY tiers, global staked |
| `POST /api/v1/sovereign/stake` | ✅ | Locks GSTD, sets tier |
| `POST /api/v1/sovereign/unstake` | ✅ | Releases stake after cooldown |

### Node Network
| Feature | Status | Notes |
|---------|--------|-------|
| `POST /api/v1/nodes/register` | ✅ | Stores node record in KV |
| `POST /api/v1/nodes/heartbeat` | ✅ | Updates last_seen, online status |
| `GET /api/v1/nodes/list` | ✅ | Returns all nodes with online/offline |
| `GET /api/v1/nodes/rewards/network` | ✅ | Network reward stats from KV |
| `POST /api/v1/nodes/claim-rewards` | ✅ | Moves pending → balance |
| `GET /api/v1/ecosystem/features` | ✅ | Feature flags for UI (just created) |

### Mobile Node (TMA)
| Feature | Status | Notes |
|---------|--------|-------|
| `/tma` Mini App | ✅ | Mobile node UI |
| `POST /api/v1/mobile/node/register` | ✅ | Mobile node registration |
| `POST /api/v1/mobile/node/claim` | ✅ | Claim mobile rewards |
| `GET /api/v1/mobile/network-stats` | ✅ | Network stats for TMA |

### Enterprise API
| Feature | Status | Notes |
|---------|--------|-------|
| `GET/POST/DELETE /api/v1/enterprise/keys` | ✅ | API key management |
| `GET /api/v1/enterprise/usage` | ✅ | Per-key token + cost tracking |
| `GET /api/v1/enterprise/pricing` | ✅ | Public pricing comparison |

### Golden Reserve Fund
| Feature | Status | Notes |
|---------|--------|-------|
| `GET /api/v1/fund/status` | ✅ | Balance, fee split, usage breakdown |
| `GET /api/v1/fund/epoch` | ✅ | 30-day epoch data |
| `GET /api/v1/fund/revenue` | ✅ | Revenue by stream |
| `GET /api/v1/fund/leaderboard` | ✅ | Top contributors |

### Other
| Feature | Status | Notes |
|---------|--------|-------|
| `GET /api/v1/queue/stats` | ✅ | Task queue depth |
| `GET /api/v1/models/catalog` | ✅ | 25+ models with availability |
| `POST /api/v1/models/pull` | ✅ | Trigger model download on node |
| Access tier system (`/api/v1/access/tier`) | ✅ | 5 tiers, zero-balance onboarding |
| Wallet linking (TON, MetaMask, Phantom) | ✅ | Via TonConnect + WalletStore |
| Rate limiting (Edge) | ✅ | `src/middleware.ts` on all `/api/*` |

---

## ⚠️ What's Incomplete (Technical Debt)

### 1. Telegram Webhook — NEEDS ACTIVATION
The webhook handler exists at `/api/v1/telegram/webhook` but Telegram doesn't know about it.
```
Required action:
  POST https://api.telegram.org/bot<TOKEN>/setWebhook
  {"url": "https://app.gstdtoken.com/api/v1/telegram/webhook"}

Then: Set TELEGRAM_BOT_TOKEN in Vercel dashboard (not in Pi's .env)
Then: Remove TELEGRAM_BOT_TOKEN from /home/bot/gstdbot/.env
```

### 2. Stub Routes (return hardcoded data, no real implementation)
| Route | Issue |
|-------|-------|
| `GET /api/v1/nodes/liquidity/pools` | Returns `[]` — no liquidity pool contract |
| `GET /api/v1/autonomy/status` | Returns `active: false, mode: standby` always |
| `GET /api/v1/nodes/tools/governance/active` | Returns empty proposals — awaits DAO contract |
| `GET /api/v1/rpc/chains` | ETH/SOL/XRP marked "coming" — bridge not deployed |
| `GET /api/v1/network/info` | Partially hardcoded |
| `GET /api/v1/nodes/network-info` | Partially hardcoded |
| `GET /api/v1/naas/stats` | `chains_supported: 0`, `rpc_requests_24h: 0` |

### 3. Pages With Broken/Missing Backend
| Page | Issue |
|------|-------|
| `/bridge` | UI exists, no TON bridge contract deployed |
| `/swap` | UI exists, needs DEX liquidity pool |
| `/agents` | Calls `/api/v1/agents/*` endpoints that don't exist (404) |
| `/operator` | Calls `/api/v1/autonomy/operator` — check if functioning |
| `/hive` | **Removed from nav** — loads non-existent `/skills.json`, old concept |

### 4. Performance Issues
| Issue | Impact | Fix |
|-------|--------|-----|
| `common.json` = 64KB / 1358 keys | Adds ~200ms to every page load | Split by page namespace (chat.json, nodes.json, etc.) |
| TonConnect `restoreConnection: true` | ~2500ms hydration delay on dashboard | Accept — needed for wallet state |
| `LandingEmbed` on every page | Minor i18n overhead | Acceptable |

### 5. No Git / No Vercel Deploy
- The frontend code is modified locally but **not committed** and **not deployed** to Vercel
- All changes are only on the Pi filesystem
- To go live: `cd /home/bot/gstdai && git add -A && git commit && git push origin main`

### 6. Vercel Environment Variables — Not Set
These env vars exist in code but may not be in Vercel dashboard:
| Variable | Used By |
|----------|---------|
| `TELEGRAM_BOT_TOKEN` | Telegram webhook handler |
| `ENTERPRISE_MASTER_KEY` | Enterprise API key management |
| `KV_REST_API_URL` + `KV_REST_API_TOKEN` | All KV storage (critical) |
| `TREASURY_SECRET` | Treasury admin endpoint |

### 7. Missing Pi Node Features
| Feature | Status |
|---------|--------|
| Multi-model routing (pick cheapest capable node) | Partial — `lib/nodes.ts` tries but no load balancing |
| Pi node tunnel URL pushed to GitHub for peer discovery | Implemented in `tunnel.sh`, needs `GITHUB_PAT` secret |
| Pi restarts when tunnel dies | pm2 `--restart-delay` set, but tunnel URL must be re-pushed |

---

## 🗑️ Removed / No Longer In Use

| Item | Action Taken | Reason |
|------|-------------|--------|
| GROQ / `GROQ_API_KEY` | Fully removed | All inference via GSTD nodes |
| Token burning | Disabled (burn_rate_pct: 0) | All fees → node operators |
| `/hive` nav entry | Removed from nav | Old "Agent Collective" concept, loads missing `/skills.json` |
| `api.gstdtoken.com` proxy rewrites | Already removed | Go backend doesn't exist |

---

## 🔜 What Still Needs To Be Done (Priority Order)

### P0 — Breaks Users Right Now
1. **Deploy to Vercel** — local changes aren't live. Git commit + push required.
2. **Activate Telegram webhook** — bot responds to commands but only on Pi (not via Vercel webhook). Register the webhook URL.
3. **Set Vercel env vars** — `TELEGRAM_BOT_TOKEN`, `ENTERPRISE_MASTER_KEY`, KV credentials.

### P1 — Core Platform Gaps
4. **TON Smart Contract** — needed for: on-chain GSTD balance reads, bridge, DAO governance, on-chain staking.
   Currently all balances are KV-based (off-chain simulation only).
5. **Real staking rewards** — currently `claim-rewards` moves KV counters. No on-chain GSTD transfer.
6. **Wallet balance sync** — `balance:${wallet}` in KV is manually updated. Should read from TON chain.

### P2 — User Experience
7. **Split `common.json`** — 64KB translation file loads on every page. Split into `chat.json`, `nodes.json`, `staking.json` etc. using next-i18next namespaces.
8. **Remove or fix `/agents` page** — calls non-existent endpoints. Either build the agents API or redirect to `/nodes`.
9. **`/operator` page audit** — verify autonomy/operator endpoint returns useful data.

### P3 — Future Features
10. **Bridge** — multichain GSTD bridge (ETH, SOL, XRP). Awaits Axelar/LayerZero integration.
11. **DAO governance** — voting on protocol params. Awaits TON contract + `/api/v1/nodes/tools/governance` implementation.
12. **NaaS (Node-as-a-Service)** — multi-chain RPC. `naas/stats` is stubbed.
13. **Referral rewards** — `/referrals` page exists, backend to actually distribute referral GSTD missing.
14. **DEX / Swap** — UI exists at `/swap`, needs AMM liquidity pool.

---

## 🏗️ Architecture Notes

- **No Go backend** — everything is Next.js serverless on Vercel + Upstash Redis KV
- **KV schema**: `balance:{wallet}`, `node:{nodeId}`, `tg_wallet:{userId}`, `tg_session:{userId}`, `rewards:pending:{wallet}`, `enterprise:key:{keyId}`
- **AI inference path**: Frontend → `lib/nodes.ts` → Pi node Cloudflare tunnel → Ollama
- **Pi process manager**: pm2 with `ecosystem.config.js` running `gstdnode` and `gstdbot`
- **Tunnel**: `tunnel.sh` (Cloudflare) writes URL to `/tmp/gstd_tunnel_url.txt`, optionally pushes to GitHub seed file
