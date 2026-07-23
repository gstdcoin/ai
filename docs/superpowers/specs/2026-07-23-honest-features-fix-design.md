# Honest & Working Features Fix — Design

**Repo:** gstdai (frontend only — `frontend/`)
**Scope:** First sub-project of the broader "bring the whole GSTD ecosystem to a fully working state" effort. The other tracks (gstd-bridge crypto redesign, gstdai Go backend fate, general polish) are separate, later sub-projects and are explicitly out of scope here.

## Problem

An audit of `/agents`, `/operator`, `/swap`, `/bridge`, and `naas/stats` found two categories of defect:

1. **Real bugs** — API responses and frontend code disagree on field names/shapes, so pages crash or silently render wrong data.
2. **Overclaiming copy** — UI text describes autonomous/AI/infrastructure behavior that doesn't exist (fictional container/Go-routine telemetry, "100% autonomously managed" framing) — the same class of issue found and fixed repeatedly elsewhere in this project (gstd-a2a docstrings, gstdweb metrics).

## Fixes

### 1. `/agents` — field-name mismatches (real bug, crashes on first real node)

`agents.tsx`'s `AgentEntry`/`MarketplaceAgent` interfaces don't match what `leaderboard.ts`/`marketplace.ts`/`stats/network.ts` actually return:

| Frontend expects | API returns | Effect |
|---|---|---|
| `agent_id` | `id` | React key + display fallback broken |
| `total_earned_gstd` | `gstd_earned` | `agent.total_earned_gstd.toFixed(2)` throws — **undefined has no toFixed** |
| `tasks_completed` | `tasks_done` | `agent.tasks_completed.toLocaleString()` throws |
| `uptime_pct` (name matches, but can be `null`) | `uptime_pct: node.uptime_pct ?? null` | `agent.uptime_pct.toFixed(0)` throws when null |
| `online` | `is_online` | Always shows "Offline" |
| `average_rating` | `rating` | `agent.average_rating.toFixed(1)` throws |
| `price_per_task_gstd` | `cost_per_task` (string `"0.001 GSTD"`, hardcoded for every agent) | Renders blank; also fake — not a real price |
| tier values: `sovereign/titan/storm/flame/spark` (defined in `agents.tsx`'s own `TIER_STYLES` and `JoinSection`'s threshold table) | `getTier()` in both API files returns `diamond/gold/silver/bronze` | Every agent silently falls back to the `spark` badge regardless of real tier |

**Fix:** change `leaderboard.ts`, `marketplace.ts`, and `stats/network.ts` to return the exact field names/shape the frontend already expects (frontend interfaces are the more complete, semantically-named contract — no other consumer depends on the current API field names, confirmed via repo-wide grep across gstdai/gstdbot/gstd-a2a/gstdweb). Fix `getTier()` in both API files to use the same thresholds already defined in `agents.tsx`'s `JoinSection` tier table (spark: 0, flame: 50, storm: 500, titan: 2000, sovereign: 10000 GSTD earned). Guard `uptime_pct` in the frontend against `null` (render `—` instead of calling `.toFixed`). Drop the hardcoded `rating: 5.0` default and `cost_per_task: '0.001 GSTD'` literal from `marketplace.ts` — if a node has no real rating/price data, return `null` and have the frontend render "Not yet rated" / "Free" rather than a fabricated number. `stats/network.ts` must also rename `total_gstd_earned`→`total_gstd_paid` to match what `agents.tsx` reads. No KV counter tracks a rolling 24h task count or network uptime percentage anywhere in the codebase (confirmed via grep — there is no `_24h`/`daily` key pattern in `kv.ts` or the task-completion handlers), so fabricating `tasks_last_24h`/`network_uptime_pct` would just be new fake numbers. Instead, remove both fields from the `NetworkStats` frontend interface and drop their stat cards from `agents.tsx` entirely — showing two honestly-absent metrics is worse than showing fewer, real ones.

**Delete `agents/register.ts`.** It writes an `agent:{id}` key to KV that nothing in the codebase ever reads (confirmed via grep — `tasks/poll.ts` and all task-routing code only recognize `node:*` keys from `nodes/register.ts`). No UI calls this endpoint (`agents.tsx`'s "Register Your Agent" button links to `/agent`, a different page using the real `nodes/register.ts` flow). This is dead code that implies a registration path that doesn't do anything.

### 2. `/operator` — dashboard is dead code + fictional infrastructure copy

`operator.tsx` gates its entire real dashboard behind `!status.server_health` — but `autonomy/operator.ts` never returns a `server_health` field, so production **always** shows the "Coming Soon" placeholder. The gated-off dashboard, if it ever rendered, would show `containers_running`, `go_routines`, `memory_usage_pct`, `load_avg_1m` — Docker container and Go-process metrics that cannot exist on this stack (`CLAUDE.md`: "Hosting: Vercel (serverless). No Go backend. No Docker in production."). Adding a `server_health` field to satisfy the gate would mean fabricating numbers for infrastructure that isn't there.

**Fix:** Replace the `server_health`/container/Go-routine concept entirely with the real network telemetry `autonomy/operator.ts` already computes (active nodes, queued tasks, GSTD distributed, training jobs, rate-limiting status) — this data is genuinely live, just needs to be the thing the page actually gates on and displays, instead of fictional server metrics. Concretely: rename the gate condition to check for the real fields already present in the API response (`departments`, `mode`) instead of the never-present `server_health`; replace the "Server Telemetry" panel with a "Network Telemetry" panel showing the same real numbers already shown per-department (active node count, queue depth) at a glance; remove the `containers_running`/`go_routines`/`memory_usage_pct`/`load_avg_1m` fields and UI entirely.

Rewrite the intro copy: replace "The GSTD ecosystem is 100% autonomously managed by a continuously running AI Operator. 9 specialized AI departments orchestrate economics, code validation, scaling, and governance in real-time" with an honest description — a live dashboard of network activity, where some categories (Node Scaling, Operations, Economics, Research) reflect real live metrics and others (Security, Code Validation, Governance, Marketing, Partnerships) are manual/planned, not automated. Keep the department-tile layout (per the earlier decision) but each tile's copy must not claim automation that isn't there — e.g. "Security: Rate limiting active" (true, keep) vs. a department with no real backing getting a label like "Manual — no automated scheduler yet" instead of implying 24/7 AI orchestration.

### 3. `/swap` — broken block-explorer link (minor, real bug)

Line 177 stores `result.boc` (the signed transaction BOC) as `txHash`, then line 238 links to `https://tonviewer.com/transaction/${txHash}` — not a valid Tonviewer URL shape; a BOC is not a transaction hash and TonConnect's `sendTransaction` result doesn't include one synchronously. **Fix:** link to the sender's own account page instead — `https://tonviewer.com/${userAddress}` — where the just-sent transaction will actually appear, rather than constructing an invalid transaction-specific URL.

### 4. `/bridge` — copy consistency (copy-only, page is already otherwise honest)

- Line 128: `"Trustless — validators sign every transfer"` is present-tense and contradicts the page's own "not yet deployed" banner a few lines above. **Fix:** reword to future/conditional tense, e.g. "Trustless by design — validators will sign every transfer once live."
- Line 136 / 86: the "Validators" stat card shows `stats.active_nodes` (real GSTD compute nodes) mislabeled as bridge validators — no bridge validators exist. **Fix:** remove the "Validators" stat card entirely until real bridge validators exist (tracked separately under the gstd-bridge redesign sub-project).

### 5. `naas/stats.ts` — vestigial "active" status (real bug: contradicts its own numbers)

`GSTD_NAAS_ENABLED=false` in gstdbot's production `ecosystem.config.js` — NaaS is genuinely disabled on the running node. Yet the endpoint hardcodes `status: 'active'` and a `note` claiming "Multi-chain RPC enabled via GSTD_NAAS_ENABLED=true on nodes." **Fix (per this track's scope — real feature enablement is a separate future decision):** change `status` to `'not_enabled'`, remove the misleading `note` field, and drop `active_nodes` from the response — it was a copy of `total_nodes` with no real health check behind it (a feature reporting live per-chain data would compute this for real; a disabled one shouldn't report it at all). `chains_supported`/`rpc_requests_24h` stay `0`, now consistent with an honestly-reported disabled status instead of contradicting a claimed "active" one.

## Out of scope (explicitly deferred to other sub-projects)

- Actually enabling NaaS in production (`GSTD_NAAS_ENABLED=true`) — requires first verifying `NaaSManager` in gstdbot is production-ready.
- Wiring `agents/register.ts`-style registration into real task routing — the existing `nodes/register.ts` flow already serves this purpose; no second registration path is being built.
- Any gstd-bridge validator/crypto work — real bridge validators, real MPC, real on-chain execution are a dedicated, separate, security-critical project.
- gstdai's dormant Go backend — separate decision track (archive vs. deploy).

## Testing

- `npx tsc --noEmit` clean after interface/API changes.
- `npm run build` succeeds (14+ pages).
- Local dev server: hit each changed endpoint via curl, confirm response shape matches the (updated) frontend interfaces exactly.
- Manually render `/agents`, `/operator`, `/swap`, `/bridge` against local dev with at least one real `node:*` KV record seeded, confirm no console errors and no `.toFixed`/`.toLocaleString` crashes.
- Since this repo deploys live on every push to `main` (GitHub Actions → Vercel), verify live after push: `curl` the changed API routes for 200 + correct field names, and spot-check each changed page loads without a client-side error (check for hydration/runtime errors via the page's rendered HTML plus a live console check if possible).
