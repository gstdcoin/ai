# Honest Features Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix five real defects in gstdai's frontend where API/UI contracts mismatch (causing crashes or dead code paths) or copy overclaims functionality that doesn't exist.

**Architecture:** No new infrastructure — this is a targeted bug-fix + honesty pass across existing Next.js Pages Router API routes and pages, all backed by the existing Upstash Redis KV wrapper (`src/lib/kv.ts`). Every change either (a) makes an API response's field names match what the frontend already expects, or (b) rewrites UI copy/logic to reflect what the underlying data actually represents.

**Tech Stack:** Next.js 16 (Pages Router), TypeScript, Tailwind CSS, Upstash Redis via `@vercel/kv` (`src/lib/kv.ts`). No test framework exists in this repo (confirmed: no jest/vitest, no `*.test.*` files) — verification follows this repo's established pattern from every other fix this session: `tsc --noEmit`, `npm run build`, and `curl` against a running local dev server, then a live spot-check after deploy.

## Global Constraints

- Repo root for all file paths below: `/home/bot/gstdai/frontend/` (paths given relative to this).
- Do not add `as any` casts in API routes (per `CLAUDE.md`).
- KV access only via `kvGet`/`kvSet`/`kvKeys`/`kvMGet`/`kvLLen`/`kvIncr` from `src/lib/kv` (per `CLAUDE.md`).
- Do not fabricate any numeric field with no real data source behind it — if there's nothing real to report, omit the field (frontend renders `—`/"Not yet rated"/"Free" for absence) rather than hardcoding a plausible-looking number.
- Tier taxonomy across the whole `/agents` feature is `spark` (0+) → `flame` (50+) → `storm` (500+) → `titan` (2000+) → `sovereign` (10000+) GSTD earned — these are the only five valid tier strings, matching `agents.tsx`'s existing `TIER_STYLES` and `JoinSection` threshold table.
- This repo deploys live on every push to `main` via GitHub Actions → Vercel (per `CLAUDE.md`) — do not push until every task's local verification (Task 8) has passed for the whole branch of work.

---

### Task 1: Fix `/agents` API contract (leaderboard, marketplace, network stats)

**Files:**
- Modify: `src/pages/api/v1/agents/leaderboard.ts`
- Modify: `src/pages/api/v1/agents/marketplace.ts`
- Modify: `src/pages/api/v1/agents/stats/network.ts`

**Interfaces:**
- Produces: three JSON response shapes that Task 2 will make `agents.tsx` consume:
  - `GET /api/v1/agents/leaderboard?limit=N` → `{ agents: Array<{ rank: number; agent_id: string; name: string; tier: 'spark'|'flame'|'storm'|'titan'|'sovereign'; total_earned_gstd: number; tasks_completed: number; uptime_pct: number | null; capabilities: string[]; online: boolean }>; total: number }`
  - `GET /api/v1/agents/marketplace?limit=N` → `{ agents: Array<{ agent_id: string; name: string; description: string; capabilities: string[]; tier: 'spark'|'flame'|'storm'|'titan'|'sovereign'; tasks_completed: number; average_rating: number | null; price_per_task_gstd: number | null; online: boolean }>; total: number }`
  - `GET /api/v1/agents/stats/network` → `{ total_agents: number; online_agents: number; total_gstd_paid: number; timestamp: number }`

- [ ] **Step 1: Rewrite `src/pages/api/v1/agents/leaderboard.ts`**

Replace the entire file with:

```ts
/**
 * GET /api/v1/agents/leaderboard
 *
 * Returns the top agents ranked by tasks completed.
 * Agents are nodes that have completed tasks and registered via the A2A protocol.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvGet, kvKeys } from '../../../../lib/kv';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    res.setHeader('Cache-Control', 'public, max-age=30, stale-while-revalidate=60');

    try {
        const rootKeys = (await kvKeys('node:')).filter((k: string) => !k.slice(5).includes(':'));
        const agentData = await Promise.all(
            rootKeys.slice(0, 50).map(async (key) => {
                const raw = await kvGet(key);
                if (!raw) return null;
                try { return JSON.parse(raw); }
                catch { return null; }
            })
        );

        // Deduplicate by URL; prefer named nodes over UUID IDs
        const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-/i;
        const allNodes = agentData.filter(Boolean) as any[];
        allNodes.sort((a, b) => (UUID_RE.test(a.node_id) ? 1 : 0) - (UUID_RE.test(b.node_id) ? 1 : 0));
        const seen = new Set<string>();
        const deduped = allNodes.filter(n => {
            const url = n.node_url || n.multiaddrs?.[0] || '';
            if (!url) return true;
            if (seen.has(url)) return false;
            seen.add(url); return true;
        });

        const agents = deduped
            .map((node: any, idx: number) => {
                const gstdEarned = node.gstd_earned || node.total_earned || 0;
                return {
                    rank:              idx + 1,
                    agent_id:          node.node_id || node.id || `agent-${idx}`,
                    name:              node.name || node.node_id || `Agent #${idx + 1}`,
                    tier:              getTier(gstdEarned),
                    total_earned_gstd: gstdEarned,
                    tasks_completed:   node.tasks_completed || 0,
                    uptime_pct:        node.uptime_pct ?? null,
                    capabilities:      node.capabilities || [],
                    online:            (Date.now() - new Date(node.last_seen || 0).getTime()) < 600_000,
                };
            })
            .sort((a, b) => b.tasks_completed - a.tasks_completed)
            .map((a, idx) => ({ ...a, rank: idx + 1 }));

        return res.status(200).json({ agents, total: agents.length });
    } catch (err: any) {
        console.error('[agents/leaderboard]', err.message);
        return res.status(500).json({ error: 'Internal error' });
    }
}

function getTier(gstdEarned: number): string {
    if (gstdEarned >= 10000) return 'sovereign';
    if (gstdEarned >= 2000)  return 'titan';
    if (gstdEarned >= 500)   return 'storm';
    if (gstdEarned >= 50)    return 'flame';
    return 'spark';
}
```

- [ ] **Step 2: Rewrite `src/pages/api/v1/agents/marketplace.ts`**

Replace the entire file with:

```ts
/**
 * GET /api/v1/agents/marketplace
 *
 * Lists agents available for hire / task routing.
 * Returns nodes that are currently online and accepting tasks.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvGet, kvKeys } from '../../../../lib/kv';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    res.setHeader('Cache-Control', 'public, max-age=20, stale-while-revalidate=40');

    try {
        const rootKeys = (await kvKeys('node:')).filter((k: string) => !k.slice(5).includes(':'));
        const now = Date.now();
        const agentData = await Promise.all(
            rootKeys.slice(0, 100).map(async (key) => {
                const raw = await kvGet(key);
                if (!raw) return null;
                try { return JSON.parse(raw); }
                catch { return null; }
            })
        );

        // Deduplicate by node_url; prefer named over UUID-generated IDs
        const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-/i;
        const allNodes = agentData.filter(Boolean) as any[];
        allNodes.sort((a, b) => (UUID_RE.test(a.node_id) ? 1 : 0) - (UUID_RE.test(b.node_id) ? 1 : 0));
        const seenUrls = new Set<string>();
        const deduped = allNodes.filter(n => {
            const url = n.node_url || n.multiaddrs?.[0] || '';
            if (!url) return true;
            if (seenUrls.has(url)) return false;
            seenUrls.add(url); return true;
        });

        const agents = deduped
            .filter((node: any) => (now - new Date(node.last_seen || 0).getTime()) < 600_000)
            .map((node: any) => {
                const gstdEarned = node.gstd_earned || node.total_earned || 0;
                return {
                    agent_id:            node.node_id || node.id,
                    name:                node.name || node.node_id,
                    description:         node.description || 'General-purpose GSTD compute node',
                    capabilities:        node.capabilities || ['inference', 'compute'],
                    tier:                getTier(gstdEarned),
                    tasks_completed:     node.tasks_completed || 0,
                    average_rating:      node.rating ?? null,
                    price_per_task_gstd: node.price_per_task_gstd ?? null,
                    online:              true,
                };
            });

        return res.status(200).json({ agents, total: agents.length });
    } catch (err: any) {
        console.error('[agents/marketplace]', err.message);
        return res.status(500).json({ error: 'Internal error' });
    }
}

function getTier(gstdEarned: number): string {
    if (gstdEarned >= 10000) return 'sovereign';
    if (gstdEarned >= 2000)  return 'titan';
    if (gstdEarned >= 500)   return 'storm';
    if (gstdEarned >= 50)    return 'flame';
    return 'spark';
}
```

- [ ] **Step 3: Rewrite `src/pages/api/v1/agents/stats/network.ts`**

Replace the entire file with:

```ts
/**
 * GET /api/v1/agents/stats/network
 *
 * Agent network summary statistics — online agents, GSTD distributed.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvGet, kvKeys, kvMGet } from '../../../../../lib/kv';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    res.setHeader('Cache-Control', 'public, max-age=15, stale-while-revalidate=30');

    try {
        const [allNodeKeys, totalGstdPaid] = await Promise.all([
            kvKeys('node:'),
            kvGet('stats:total_gstd_paid'),
        ]);

        // Filter sub-keys and deduplicate by URL
        const rootKeys = allNodeKeys.filter((k: string) => !k.slice(5).includes(':'));
        const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-/i;
        let online = 0;

        if (rootKeys.length > 0) {
            const values = await kvMGet(rootKeys).catch(() => [] as (string|null)[]);
            const records = values.filter((v): v is string => v !== null).map(v => { try { return JSON.parse(v); } catch { return null; } }).filter(Boolean) as any[];
            records.sort((a, b) => (UUID_RE.test(a.node_id) ? 1 : 0) - (UUID_RE.test(b.node_id) ? 1 : 0));
            const seenUrls = new Set<string>();
            const deduped = records.filter((n: any) => {
                const url = n.node_url || n.multiaddrs?.[0] || '';
                if (!url) return true;
                if (seenUrls.has(url)) return false;
                seenUrls.add(url); return true;
            });
            const now = Date.now();
            online = deduped.filter((n: any) => (now - new Date(n.last_seen || 0).getTime()) < 600_000).length;
        }

        return res.status(200).json({
            total_agents:     rootKeys.length,
            online_agents:    online,
            total_gstd_paid:  parseFloat(totalGstdPaid || '0'),
            timestamp:        Date.now(),
        });
    } catch (err: any) {
        console.error('[agents/stats/network]', err.message);
        return res.status(500).json({ error: 'Internal error' });
    }
}
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `cd /home/bot/gstdai/frontend && npx tsc --noEmit -p .`
Expected: no errors referencing these three files.

- [ ] **Step 5: Commit**

```bash
cd /home/bot/gstdai
git add frontend/src/pages/api/v1/agents/leaderboard.ts frontend/src/pages/api/v1/agents/marketplace.ts frontend/src/pages/api/v1/agents/stats/network.ts
git commit -m "fix: align /agents API field names + tier taxonomy with frontend contract"
```

---

### Task 2: Fix `/agents` frontend to match the new API contract; delete dead register endpoint

**Files:**
- Modify: `src/pages/agents.tsx`
- Delete: `src/pages/api/v1/agents/register.ts`

**Interfaces:**
- Consumes: the three response shapes produced by Task 1.
- Produces: nothing consumed by later tasks (this feature is now internally consistent end-to-end).

- [ ] **Step 1: Update `AgentEntry`, `MarketplaceAgent`, and `NetworkStats` interfaces in `src/pages/agents.tsx`**

Replace lines 16–54 (the three interfaces) with:

```ts
interface AgentEntry {
  rank: number;
  agent_id: string;
  name: string;
  tier: string;
  total_earned_gstd: number;
  tasks_completed: number;
  uptime_pct: number | null;
  capabilities: string[];
  online: boolean;
}

interface MarketplaceAgent {
  agent_id: string;
  name: string;
  description: string;
  capabilities: string[];
  tier: string;
  tasks_completed: number;
  average_rating: number | null;
  price_per_task_gstd: number | null;
  online: boolean;
}

interface NetworkStats {
  total_agents: number;
  online_agents: number;
  total_gstd_paid: number;
  join_instructions?: {
    python: string;
    curl: string;
    github: string;
  };
}
```

- [ ] **Step 2: Guard the `Leaderboard` component against `null` uptime and rename fields**

In the `Leaderboard` function, replace:

```tsx
            <div className="flex gap-3 mt-0.5 text-xs text-gray-500">
              <span>{agent.tasks_completed.toLocaleString()} tasks</span>
              <span>{agent.uptime_pct.toFixed(0)}% uptime</span>
            </div>
```

with:

```tsx
            <div className="flex gap-3 mt-0.5 text-xs text-gray-500">
              <span>{agent.tasks_completed.toLocaleString()} tasks</span>
              <span>{agent.uptime_pct != null ? `${agent.uptime_pct.toFixed(0)}% uptime` : 'uptime —'}</span>
            </div>
```

(`agent.tasks_completed`/`agent.total_earned_gstd` now safely resolve because Task 1's API returns those exact field names — no further change needed at line 164's `{agent.total_earned_gstd.toFixed(2)} GSTD`.)

- [ ] **Step 3: Guard the `Marketplace` component against `null` rating and price**

In the `Marketplace` function, replace:

```tsx
                <div className="text-right text-sm">
                  <div className="font-semibold text-violet-300">{agent.price_per_task_gstd} GSTD</div>
                  <div className="text-xs text-gray-500">per task</div>
                </div>
```

with:

```tsx
                <div className="text-right text-sm">
                  <div className="font-semibold text-violet-300">
                    {agent.price_per_task_gstd != null ? `${agent.price_per_task_gstd} GSTD` : 'Free'}
                  </div>
                  <div className="text-xs text-gray-500">per task</div>
                </div>
```

and replace:

```tsx
                  <span className="flex items-center gap-1">
                    <Star size={10} className="text-yellow-400" />
                    {agent.average_rating.toFixed(1)}
                  </span>
```

with:

```tsx
                  <span className="flex items-center gap-1">
                    <Star size={10} className="text-yellow-400" />
                    {agent.average_rating != null ? agent.average_rating.toFixed(1) : 'Not yet rated'}
                  </span>
```

- [ ] **Step 4: Drop the two dead stat cards from the main page component**

In the `AgentsPage` function, replace:

```tsx
  const statCards = [
    { label: 'Total Agents', value: loadingStats ? '—' : (stats?.total_agents ?? 0).toLocaleString(), icon: Bot, color: 'violet' },
    { label: 'Online Now',   value: loadingStats ? '—' : (stats?.online_agents ?? 0).toLocaleString(), icon: Activity, color: 'emerald' },
    { label: 'Tasks (24h)',  value: loadingStats ? '—' : (stats?.tasks_last_24h ?? 0).toLocaleString(), icon: Zap, color: 'cyan' },
    { label: 'GSTD Paid',   value: loadingStats ? '—' : `${(stats?.total_gstd_paid ?? 0).toFixed(0)}`, icon: Trophy, color: 'yellow' },
  ];
```

with:

```tsx
  const statCards = [
    { label: 'Total Agents', value: loadingStats ? '—' : (stats?.total_agents ?? 0).toLocaleString(), icon: Bot, color: 'violet' },
    { label: 'Online Now',   value: loadingStats ? '—' : (stats?.online_agents ?? 0).toLocaleString(), icon: Activity, color: 'emerald' },
    { label: 'GSTD Paid',   value: loadingStats ? '—' : `${(stats?.total_gstd_paid ?? 0).toFixed(0)}`, icon: Trophy, color: 'yellow' },
  ];
```

The grid is `grid-cols-2 md:grid-cols-4` (line 513) — change to `grid-cols-3` since there are now 3 cards, not 4:

```tsx
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-8">
```

- [ ] **Step 5: Delete the dead registration endpoint**

```bash
rm /home/bot/gstdai/frontend/src/pages/api/v1/agents/register.ts
```

(Confirmed via repo-wide grep at brainstorming time: no UI calls this endpoint, and nothing in task-routing code — `tasks/poll.ts` included — ever reads the `agent:*` KV keys it writes. Real node registration goes through `nodes/register.ts`, which this task does not touch.)

- [ ] **Step 6: Verify TypeScript compiles and build succeeds**

Run: `cd /home/bot/gstdai/frontend && npx tsc --noEmit -p .`
Expected: no errors.

Run: `npm run build`
Expected: build succeeds, same page count as before minus the deleted API route (route list will show `/api/v1/agents/register` no longer present).

- [ ] **Step 7: Start local dev server and verify the page renders without a client-side crash**

Run: `npm run dev &` then, once ready:
```bash
curl -s http://localhost:3000/api/v1/agents/leaderboard | python3 -m json.tool
curl -s http://localhost:3000/api/v1/agents/marketplace | python3 -m json.tool
curl -s http://localhost:3000/api/v1/agents/stats/network | python3 -m json.tool
```
Expected: all three return valid JSON matching the shapes from Task 1 (empty `agents: []` is fine locally with no KV credentials — `src/lib/kv.ts` falls back to an in-memory store per `CLAUDE.md`). Then fetch the page itself:
```bash
curl -s http://localhost:3000/agents -o /tmp/agents-page.html -w "%{http_code}\n"
```
Expected: `200`.

- [ ] **Step 8: Commit**

```bash
cd /home/bot/gstdai
git add frontend/src/pages/agents.tsx
git rm frontend/src/pages/api/v1/agents/register.ts
git commit -m "fix: match /agents frontend to real API contract, guard null rating/uptime, delete dead register endpoint"
```

---

### Task 3: Fix `/api/v1/autonomy/operator.ts` — replace fictional server telemetry with real network telemetry

**Files:**
- Modify: `src/pages/api/v1/autonomy/operator.ts`

**Interfaces:**
- Produces: `{ active: boolean; mode: string; active_nodes: number; tasks_completed: number; gstd_distributed: number; training_jobs: number; queue_depth: number; departments: Array<{ name: string; interval: string; scope: string; status: 'active'|'idle'|'manual'; metric: string }> }` — Task 4 (the `operator.tsx` page) will consume this exact shape. Note there is no `server_health` field in this response — Task 4 must not gate rendering on it.

- [ ] **Step 1: Rewrite the department status logic and drop the fictional catch-all**

Replace the whole file with:

```ts
/**
 * GET /api/v1/autonomy/operator
 * Live network telemetry, presented as monitoring categories.
 * Four categories reflect real KV-backed metrics; the rest are honestly
 * labeled 'manual' because no automated scheduler runs them yet.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvGet, kvKeys, kvLLen } from '../../../../lib/kv';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    res.setHeader('Cache-Control', 'public, max-age=30, stale-while-revalidate=60');

    try {
        const [totalTasksDone, totalGstdPaid, trainingJobsSubmitted, queueLen] = await Promise.all([
            kvGet('stats:total_tasks_completed'),
            kvGet('stats:total_gstd_paid'),
            kvGet('stats:training_jobs_submitted'),
            kvLLen('tasks:queue'),
        ]);

        // Count nodes with heartbeat in last 10 minutes
        const nodeKeys = await kvKeys('node:heartbeat:');
        const now = Date.now();
        let activeNodes = 0;
        await Promise.all(nodeKeys.slice(0, 200).map(async (k) => {
            const ts = await kvGet(k);
            if (ts && now - parseInt(ts, 10) < 600_000) activeNodes++;
        }));

        const tasks  = parseInt(totalTasksDone || '0', 10);
        const gstd   = parseFloat(totalGstdPaid || '0');
        const jobs   = parseInt(trainingJobsSubmitted || '0', 10);
        const queued = typeof queueLen === 'number' ? queueLen : 0;
        const isActive = activeNodes > 0 || tasks > 0;

        const departments = [
            { name: 'Node Scaling', interval: '15m', scope: 'Node health, capacity planning, routing',   status: activeNodes > 0 ? 'active' : 'idle', metric: `${activeNodes} nodes online` },
            { name: 'Operations',   interval: '10m', scope: 'Task queue, incident response, uptime',     status: queued > 0  ? 'active' : 'idle',      metric: `${queued} tasks queued` },
            { name: 'Economics',    interval: '1h',  scope: 'Token distribution, treasury allocation',    status: gstd > 0    ? 'active' : 'idle',      metric: `${gstd.toFixed(1)} GSTD paid` },
            { name: 'Research',     interval: '24h', scope: 'AI model benchmarks, fine-tuning jobs',      status: jobs > 0    ? 'active' : 'idle',      metric: `${jobs} training jobs` },
            { name: 'Security',     interval: '5m',  scope: 'Threat detection, rate limits, anomalies',   status: 'active',                             metric: 'Rate limiting active' },
            { name: 'Code Validation', interval: '30m', scope: 'CI/CD, smart contract audits, PR review', status: 'manual',                             metric: 'Manual review — no automated scheduler yet' },
            { name: 'Governance',      interval: '6h',  scope: 'DAO proposals, voting, parameter updates', status: 'manual',                             metric: 'Awaiting DAO contract deploy' },
            { name: 'Marketing',       interval: '24h', scope: 'Social content, community metrics, growth', status: 'manual',                           metric: 'Manual for now' },
            { name: 'Partnerships',    interval: '12h', scope: 'Integration monitoring, API health checks', status: 'manual',                           metric: 'Manual for now' },
        ];

        return res.status(200).json({
            active:            isActive,
            mode:              isActive ? 'operating' : 'standby',
            active_nodes:      activeNodes,
            tasks_completed:   tasks,
            gstd_distributed:  gstd,
            training_jobs:     jobs,
            queue_depth:       queued,
            departments,
        });
    } catch {
        return res.status(200).json({ active: false, mode: 'standby', active_nodes: 0, tasks_completed: 0, gstd_distributed: 0, training_jobs: 0, queue_depth: 0, departments: [] });
    }
}
```

(This drops the `uptime_seconds: tasks * 30` field from the old response — it was a derived, not-real "uptime" number and `operator.tsx` never reads it. This also renames the previous `standby` department status to `manual`, since "standby" implied a system waiting to auto-activate, which isn't true for departments with no scheduler behind them at all.)

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd /home/bot/gstdai/frontend && npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /home/bot/gstdai
git add frontend/src/pages/api/v1/autonomy/operator.ts
git commit -m "fix: drop fictional server_health telemetry from autonomy/operator, rename standby->manual"
```

---

### Task 4: Fix `operator.tsx` — real render gate, real telemetry panel, honest copy

**Files:**
- Modify: `src/pages/operator.tsx`

**Interfaces:**
- Consumes: the response shape produced by Task 3 (no `server_health` field; `departments[].status` is now `'active' | 'idle' | 'manual'`).

- [ ] **Step 1: Replace the `OperatorStatus` interface**

Replace lines 10–21:

```ts
interface OperatorStatus {
  active: boolean;
  mode: string;
  uptime_seconds: number;
  departments: Array<{ name: string; interval: string; scope: string }>;
  server_health: {
    containers_running: number;
    memory_usage_pct: number;
    go_routines: number;
    load_avg_1m: number;
  };
}
```

with:

```ts
interface OperatorStatus {
  active: boolean;
  mode: string;
  active_nodes: number;
  tasks_completed: number;
  gstd_distributed: number;
  training_jobs: number;
  queue_depth: number;
  departments: Array<{ name: string; interval: string; scope: string; status: 'active' | 'idle' | 'manual'; metric: string }>;
}
```

- [ ] **Step 2: Fix the render gate to check real fields, not the never-present `server_health`**

Replace:

```tsx
        ) : !status || !status.departments || !status.server_health ? (
```

with:

```tsx
        ) : !status || !status.departments || !status.departments.length ? (
```

- [ ] **Step 3: Rewrite the overclaiming intro copy**

Replace:

```tsx
          <p className="text-gray-400 max-w-2xl mx-auto">
            The GSTD ecosystem is 100% autonomously managed by a continuously running AI Operator. 9 specialized AI departments orchestrate economics, code validation, scaling, and governance in real-time.
          </p>
```

with:

```tsx
          <p className="text-gray-400 max-w-2xl mx-auto">
            A live dashboard of GSTD network activity, organized into monitoring categories. Node Scaling, Operations, Economics, and Research reflect real, continuously-updated network data.
            Security enforces rate limiting automatically. Code Validation, Governance, Marketing, and Partnerships are handled manually for now — no automated scheduler runs them yet.
          </p>
```

- [ ] **Step 4: Replace the Top Metrics row (drops the fictional Containers/Go Routines tiles, adds real ones)**

Replace:

```tsx
            {/* Top Metrics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="glass-pro p-6 rounded-2xl border-l-[3px] border-emerald-500">
                <div className="flex items-center gap-2 text-gray-400 text-xs font-bold uppercase mb-2"><Activity size={14}/> Mode</div>
                <div className="text-xl font-black text-white">{status?.mode?.replace(/_/g, ' ')}</div>
              </div>
              <div className="glass-pro p-6 rounded-2xl border-l-[3px] border-cyan-500">
                <div className="flex items-center gap-2 text-gray-400 text-xs font-bold uppercase mb-2"><Layers size={14}/> Active Departments</div>
                <div className="text-xl font-black text-white">{status?.departments?.length} Sub-Agents</div>
              </div>
              <div className="glass-pro p-6 rounded-2xl border-l-[3px] border-violet-500">
                <div className="flex items-center gap-2 text-gray-400 text-xs font-bold uppercase mb-2"><Terminal size={14}/> Containers</div>
                <div className="text-xl font-black text-white">{status?.server_health?.containers_running} Running</div>
              </div>
              <div className="glass-pro p-6 rounded-2xl border-l-[3px] border-amber-500">
                <div className="flex items-center gap-2 text-gray-400 text-xs font-bold uppercase mb-2"><Cpu size={14}/> Go Routines</div>
                <div className="text-xl font-black text-white">{status?.server_health?.go_routines} Parallel</div>
              </div>
            </div>
```

with:

```tsx
            {/* Top Metrics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="glass-pro p-6 rounded-2xl border-l-[3px] border-emerald-500">
                <div className="flex items-center gap-2 text-gray-400 text-xs font-bold uppercase mb-2"><Activity size={14}/> Mode</div>
                <div className="text-xl font-black text-white">{status?.mode?.replace(/_/g, ' ')}</div>
              </div>
              <div className="glass-pro p-6 rounded-2xl border-l-[3px] border-cyan-500">
                <div className="flex items-center gap-2 text-gray-400 text-xs font-bold uppercase mb-2"><Layers size={14}/> Active Nodes</div>
                <div className="text-xl font-black text-white">{status?.active_nodes}</div>
              </div>
              <div className="glass-pro p-6 rounded-2xl border-l-[3px] border-violet-500">
                <div className="flex items-center gap-2 text-gray-400 text-xs font-bold uppercase mb-2"><Terminal size={14}/> Queue Depth</div>
                <div className="text-xl font-black text-white">{status?.queue_depth} queued</div>
              </div>
              <div className="glass-pro p-6 rounded-2xl border-l-[3px] border-amber-500">
                <div className="flex items-center gap-2 text-gray-400 text-xs font-bold uppercase mb-2"><Cpu size={14}/> GSTD Distributed</div>
                <div className="text-xl font-black text-white">{status?.gstd_distributed?.toFixed(1)}</div>
              </div>
            </div>
```

- [ ] **Step 5: Replace the "Server Telemetry" panel with a "Network Telemetry" panel showing real numbers**

Replace:

```tsx
              <div className="glass-pro p-6 rounded-2xl h-min sticky top-24">
                <h3 className="text-lg font-bold flex items-center gap-2 mb-4"><Zap size={18} className="text-violet-400"/> Server Telemetry</h3>
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between text-xs font-bold text-gray-400 mb-1">
                      <span>Server Memory Usage</span>
                      <span className={status.server_health.memory_usage_pct > 80 ? 'text-red-400' : 'text-emerald-400'}>{status.server_health.memory_usage_pct}%</span>
                    </div>
                    <div className="w-full bg-white/10 rounded-full h-1.5">
                      <div className="bg-emerald-500/80 h-1.5 rounded-full" style={{ width: `${status.server_health.memory_usage_pct}%` }}></div>
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs font-bold text-gray-400 mb-1">
                      <span>Server CPU Load (1m)</span>
                      <span>{status.server_health.load_avg_1m.toFixed(2)}</span>
                    </div>
                    <div className="w-full bg-white/10 rounded-full h-1.5">
                      <div className="bg-cyan-500/80 h-1.5 rounded-full" style={{ width: `${Math.min(100, status.server_health.load_avg_1m*20)}%` }}></div>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-white/10">
                    <p className="text-xs text-gray-500 text-center">
                      All system parameters, including Docker health, React compilation pipelines, and Blockchain interactions, are handled automatically by the AI backend.
                    </p>
                  </div>
                </div>
              </div>
```

with:

```tsx
              <div className="glass-pro p-6 rounded-2xl h-min sticky top-24">
                <h3 className="text-lg font-bold flex items-center gap-2 mb-4"><Zap size={18} className="text-violet-400"/> Network Telemetry</h3>
                <div className="space-y-4">
                  <div className="flex justify-between text-xs font-bold text-gray-400">
                    <span>Tasks Completed</span>
                    <span className="text-emerald-400">{status.tasks_completed.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-xs font-bold text-gray-400">
                    <span>Training Jobs</span>
                    <span className="text-emerald-400">{status.training_jobs.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-xs font-bold text-gray-400">
                    <span>GSTD Distributed</span>
                    <span className="text-emerald-400">{status.gstd_distributed.toFixed(1)}</span>
                  </div>

                  <div className="pt-4 border-t border-white/10">
                    <p className="text-xs text-gray-500 text-center">
                      Node Scaling, Operations, Economics, and Research read live network data. The rest are handled manually — see status per category below.
                    </p>
                  </div>
                </div>
              </div>
```

- [ ] **Step 6: Update the department tile to show its `status`/`metric` instead of just `scope`**

Replace:

```tsx
                  {status.departments.map((dept, index) => (
                    <div key={index} className="glass-pro p-5 rounded-xl shine-on-hover hover:border-cyan-500/30 transition-all">
                      <div className="flex justify-between items-start mb-2">
                        <div className="font-bold text-emerald-400">DEPT {index+1}: {dept.name}</div>
                        <div className="text-[10px] uppercase font-bold px-2 py-1 bg-white/5 rounded text-gray-400">⏱ {dept.interval}</div>
                      </div>
                      <p className="text-xs text-gray-400">{dept.scope}</p>
                    </div>
                  ))}
```

with:

```tsx
                  {status.departments.map((dept, index) => (
                    <div key={index} className="glass-pro p-5 rounded-xl shine-on-hover hover:border-cyan-500/30 transition-all">
                      <div className="flex justify-between items-start mb-2">
                        <div className={`font-bold ${dept.status === 'manual' ? 'text-gray-400' : 'text-emerald-400'}`}>DEPT {index+1}: {dept.name}</div>
                        <div className="text-[10px] uppercase font-bold px-2 py-1 bg-white/5 rounded text-gray-400">⏱ {dept.interval}</div>
                      </div>
                      <p className="text-xs text-gray-400 mb-1">{dept.scope}</p>
                      <p className="text-xs text-gray-500">{dept.metric}</p>
                    </div>
                  ))}
```

- [ ] **Step 7: Remove now-unused `Cpu`/`Terminal` import check (both are still used by the rewritten Top Metrics row — no import change needed)**

No import changes required: `Terminal` and `Cpu` icons are both still referenced in Step 4's replacement JSX.

- [ ] **Step 8: Verify TypeScript compiles and build succeeds**

Run: `cd /home/bot/gstdai/frontend && npx tsc --noEmit -p .`
Expected: no errors.

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 9: Verify the page renders the real dashboard, not "Coming Soon"**

With the local dev server running (`npm run dev`):
```bash
curl -s http://localhost:3000/api/v1/autonomy/operator | python3 -m json.tool
curl -s http://localhost:3000/operator -o /tmp/operator-page.html -w "%{http_code}\n"
grep -c "Coming Soon" /tmp/operator-page.html
```
Expected: the API call returns `departments` as a non-empty array; the page returns `200`; `grep -c "Coming Soon"` returns `0` (the placeholder text must not appear — confirming the real dashboard is what rendered, given `departments` is always populated whenever the handler doesn't hit its catch block).

- [ ] **Step 10: Commit**

```bash
cd /home/bot/gstdai
git add frontend/src/pages/operator.tsx
git commit -m "fix: operator dashboard now renders real data instead of always showing Coming Soon; honest copy"
```

---

### Task 5: Fix `/swap` broken Tonviewer link

**Files:**
- Modify: `src/pages/swap.tsx`

**Interfaces:** None — self-contained page fix.

- [ ] **Step 1: Replace the invalid transaction-hash link with a valid account-page link**

Replace:

```tsx
            {txHash && (
              <a href={`https://tonviewer.com/transaction/${txHash}`} target="_blank" rel="noopener noreferrer"
                 className="flex items-center justify-center gap-2 text-xs font-bold text-cyan-400 hover:text-cyan-300 transition-colors mb-6">
                View on Tonviewer <ExternalLink size={12} />
              </a>
            )}
```

with:

```tsx
            {userAddress && (
              <a href={`https://tonviewer.com/${userAddress}`} target="_blank" rel="noopener noreferrer"
                 className="flex items-center justify-center gap-2 text-xs font-bold text-cyan-400 hover:text-cyan-300 transition-colors mb-6">
                View wallet on Tonviewer <ExternalLink size={12} />
              </a>
            )}
```

(The transaction BOC returned by `tonConnectUI.sendTransaction` is not a transaction hash, and `tonviewer.com/transaction/<boc>` was never a valid URL. Linking to the sender's own account page is honest — the just-sent transaction will actually appear there — and avoids needing an indexer round-trip to resolve a real tx hash, which is out of scope for this fix.)

- [ ] **Step 2: Remove the now-unused `txHash` state if nothing else reads it**

Check remaining usages:
```bash
grep -n "txHash" /home/bot/gstdai/frontend/src/pages/swap.tsx
```
Expected after Step 1: only the `useState('')` declaration (line 55) and the `setTxHash(result.boc || '')` call (line 177) and `setTxHash('')` in `resetSwap` (line 201) remain, no other reads. Since `userAddress` (already available from `useTonAddress()`) now drives the link, `txHash` state is dead — remove it:

- Delete `const [txHash, setTxHash] = useState('');` (was line 55)
- Delete `setTxHash(result.boc || '');` (was line 177) — leave the surrounding `setStatus('success');` line intact
- Delete `setTxHash('');` from inside `resetSwap` (was line 201)

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd /home/bot/gstdai/frontend && npx tsc --noEmit -p .`
Expected: no errors, no unused-variable warnings for `txHash`.

- [ ] **Step 4: Commit**

```bash
cd /home/bot/gstdai
git add frontend/src/pages/swap.tsx
git commit -m "fix: swap page's Tonviewer link used a tx BOC as a hash (invalid URL); link to sender's account instead"
```

---

### Task 6: Fix `/bridge` copy — tense mismatch and unbacked Validators stat

**Files:**
- Modify: `src/pages/bridge.tsx`

**Interfaces:** None — self-contained page fix.

- [ ] **Step 1: Fix the present-tense subtitle that contradicts the "not yet deployed" banner directly above it**

Replace:

```tsx
                    <p className="text-gray-400 text-sm">
                        {t('bridge_subtitle', 'Transfer GSTD between TON, Solana, and XRPL. Trustless — validators sign every transfer.')}
                    </p>
```

with:

```tsx
                    <p className="text-gray-400 text-sm">
                        {t('bridge_subtitle', 'Transfer GSTD between TON, Solana, and XRPL. Trustless by design — validators will sign every transfer once live.')}
                    </p>
```

- [ ] **Step 2: Remove the "Validators" stat — it shows generic GSTD compute-node count, not real bridge validators (none exist yet)**

Replace:

```tsx
                {stats && (
                    <div className="grid grid-cols-3 gap-3">
                        {[
                            { label: t('validators', 'Validators'), value: stats.validators_online || '—', icon: <Shield size={14} /> },
                            { label: t('status', 'Status'), value: 'Beta', icon: <Zap size={14} /> },
                            { label: t('network', 'Network'), value: 'TON', icon: <Clock size={14} /> },
                        ].map(s => (
```

with:

```tsx
                {stats && (
                    <div className="grid grid-cols-2 gap-3">
                        {[
                            { label: t('status', 'Status'), value: 'Beta', icon: <Zap size={14} /> },
                            { label: t('network', 'Network'), value: 'TON', icon: <Clock size={14} /> },
                        ].map(s => (
```

- [ ] **Step 3: Remove the now-unused `stats` fetch of `validators_online` and the `BridgeStats` field**

Replace:

```ts
interface BridgeStats {
    validators_online: number;
    transfers_today: number;
    avg_time_secs: number;
}
```

with:

```ts
interface BridgeStats {
    transfers_today: number;
    avg_time_secs: number;
}
```

Replace:

```tsx
    useEffect(() => {
        fetch('/api/v1/stats/public')
            .then(r => r.json())
            .then(d => setStats({
                validators_online: d.active_nodes || 0,
                transfers_today:   0,
                avg_time_secs:     0,
            }))
            .catch(() => {});
    }, []);
```

with:

```tsx
    useEffect(() => {
        setStats({
            transfers_today: 0,
            avg_time_secs:   0,
        });
    }, []);
```

(No live endpoint call is needed anymore — both remaining `BridgeStats` fields are always `0` placeholders until real bridge transfers exist, and the earlier fetch's only real purpose was populating the now-removed `validators_online`.)

- [ ] **Step 4: Verify TypeScript compiles**

Run: `cd /home/bot/gstdai/frontend && npx tsc --noEmit -p .`
Expected: no errors, `Shield` import may now be unused — check:
```bash
grep -n "Shield" /home/bot/gstdai/frontend/src/pages/bridge.tsx
```
If `Shield` no longer appears anywhere except the import line, remove it from the `lucide-react` import list at the top of the file.

- [ ] **Step 5: Commit**

```bash
cd /home/bot/gstdai
git add frontend/src/pages/bridge.tsx
git commit -m "fix: bridge page copy — future-tense trustless claim, remove unbacked Validators stat"
```

---

### Task 7: Fix `naas/stats.ts` to honestly report the disabled state

**Files:**
- Modify: `src/pages/api/v1/naas/stats.ts`

**Interfaces:**
- Produces: `{ total_nodes: number; chains_supported: number; rpc_requests_24h: number; uptime_avg_pct: number; status: 'not_enabled'; timestamp: number }` — no other file in this repo consumes this endpoint's response (confirmed via grep at brainstorming time), so this is a self-contained change.

- [ ] **Step 1: Rewrite the file to drop the misleading `active` status and `note`**

Replace the entire file with:

```ts
/**
 * GET /api/v1/naas/stats
 * Node-as-a-Service statistics.
 *
 * GSTD_NAAS_ENABLED is false in gstdbot's production ecosystem.config.js —
 * NaaS is not enabled on the running node. This endpoint reports that
 * honestly rather than claiming an "active" status the numbers don't back.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvKeys } from '../../../../lib/kv';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=120');

    try {
        const rootKeys = (await kvKeys('node:')).filter((k: string) => !k.slice(5).includes(':'));
        return res.status(200).json({
            total_nodes:      rootKeys.length,
            chains_supported: 0,
            rpc_requests_24h: 0,
            status:           'not_enabled',
            timestamp:        Date.now(),
        });
    } catch (err: any) {
        console.error('[naas/stats]', err.message);
        return res.status(500).json({ error: 'Internal error' });
    }
}
```

(Drops `active_nodes` — it was a copy of `total_nodes` with no real per-node NaaS health check behind it — and `uptime_avg_pct: 99.1`, a hardcoded number with no real source. `chains_supported`/`rpc_requests_24h` stay `0`, now consistent with `status: 'not_enabled'` instead of contradicting a claimed `'active'` one.)

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd /home/bot/gstdai/frontend && npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /home/bot/gstdai
git add frontend/src/pages/api/v1/naas/stats.ts
git commit -m "fix: naas/stats reports not_enabled honestly instead of a hardcoded active status"
```

---

### Task 8: Final verification and live deploy

**Files:** None modified — verification only.

**Interfaces:** None.

- [ ] **Step 1: Full type-check and build from a clean state**

```bash
cd /home/bot/gstdai/frontend
npx tsc --noEmit -p .
npm run build
```
Expected: both succeed with zero errors. Build should report the same page count as before this branch of work minus one route (`/api/v1/agents/register` no longer exists).

- [ ] **Step 2: Start the local dev server and exercise every changed endpoint and page**

```bash
npm run dev &
sleep 5
echo "--- agents ---"
curl -s http://localhost:3000/api/v1/agents/leaderboard | python3 -m json.tool
curl -s http://localhost:3000/api/v1/agents/marketplace | python3 -m json.tool
curl -s http://localhost:3000/api/v1/agents/stats/network | python3 -m json.tool
curl -s -o /dev/null -w "agents/register -> %{http_code}\n" http://localhost:3000/api/v1/agents/register
echo "--- operator ---"
curl -s http://localhost:3000/api/v1/autonomy/operator | python3 -m json.tool
echo "--- naas ---"
curl -s http://localhost:3000/api/v1/naas/stats | python3 -m json.tool
echo "--- pages ---"
for p in agents operator swap bridge; do
  curl -s -o /dev/null -w "/$p -> %{http_code}\n" http://localhost:3000/$p
done
```
Expected:
- `agents/leaderboard`/`marketplace`/`stats/network` responses match the shapes from Task 1 (field names exactly as specified — `agent_id`, `total_earned_gstd`, `tasks_completed`, `average_rating`, `price_per_task_gstd`, `total_gstd_paid`, no `tasks_last_24h`/`network_uptime_pct`).
- `agents/register` returns `404` (file deleted — this is the expected, correct result, not a regression).
- `autonomy/operator` response has no `server_health` key and `departments[].status` values are only `'active'`, `'idle'`, or `'manual'`.
- `naas/stats` response has `"status": "not_enabled"` and no `note`/`active_nodes` keys.
- All four pages return `200`.

- [ ] **Step 3: Push and verify GitHub Actions deploy succeeds**

```bash
cd /home/bot/gstdai
git push origin main
```

Then poll the workflow run to completion (do not just check that it started):
```bash
gh run list --branch main --limit 1 --json databaseId,status,headSha
# note the databaseId, then:
gh run view <databaseId> --json status,conclusion
```
Expected: `"conclusion": "success"`.

- [ ] **Step 4: Live spot-check against production**

```bash
echo "--- live agents ---"
curl -s https://app.gstdtoken.com/api/v1/agents/leaderboard | python3 -m json.tool | head -20
curl -s -o /dev/null -w "live agents/register -> %{http_code}\n" https://app.gstdtoken.com/api/v1/agents/register
echo "--- live operator ---"
curl -s https://app.gstdtoken.com/api/v1/autonomy/operator | python3 -m json.tool | head -20
curl -s https://app.gstdtoken.com/operator -o /tmp/live-operator.html -w "operator page -> %{http_code}\n"
grep -c "Coming Soon" /tmp/live-operator.html
echo "--- live naas ---"
curl -s https://app.gstdtoken.com/api/v1/naas/stats | python3 -m json.tool
echo "--- live pages ---"
for p in agents swap bridge; do
  curl -s -o /dev/null -w "/$p -> %{http_code}\n" https://app.gstdtoken.com/$p
done
```
Expected: same shapes/behavior as the local checks in Step 2; `agents/register` returns `404` live; the live `/operator` page's HTML does not contain "Coming Soon"; `naas/stats` shows `"status": "not_enabled"`.

- [ ] **Step 5: Report completion**

No further action if all checks pass — this closes out the "honest-features-fix" sub-project. The remaining ecosystem-completion tracks (gstd-bridge crypto redesign, gstdai Go backend fate, general polish) are separate future sub-projects per the original decomposition and are not started by this plan.
