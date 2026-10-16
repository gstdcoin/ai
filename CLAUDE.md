# GSTD Platform — Development Guide

## Stack
- **Framework**: Next.js 16 (Pages Router), TypeScript, Tailwind CSS
- **State / DB**: Upstash Redis via `@upstash/redis` — all in `src/lib/kv.ts`
- **Hosting**: Cloudflare Workers is the target. The production app is not deployed yet; do not use Vercel.
- **Wallets**: TON Connect, MetaMask, Phantom

## Local Dev
```bash
cd frontend
npm install --legacy-peer-deps
npm run dev   # → http://localhost:3000
```
No KV credentials needed for local development — `src/lib/kv.ts` uses an in-memory store outside production. Production requires Redis credentials and fails closed without them.

## Architecture Rules
- ALL API logic lives in `src/pages/api/v1/` as Next.js serverless functions
- KV access ONLY via `kvGet / kvSet / kvKeys / kvDel / kvIncr` from `src/lib/kv`
- Rate limiting is handled globally by `src/middleware.ts` (Edge runtime — standard Next.js middleware convention)
- No Go backend. No `api.gstdtoken.com` proxy. The rewrites were removed.

## Adding a new API route
1. Create `src/pages/api/v1/<path>.ts`
2. Export `default async function handler(req, res)` 
3. Import kv: `import { kvGet } from '../../../lib/kv'` (adjust depth)
4. Rate limit is applied automatically by middleware

## Key paths
- `src/lib/kv.ts` — Redis wrapper (in-memory fallback for local)
- `src/lib/ratelimit.ts` — sliding window (used by individual handlers if needed)
- `src/middleware.ts` — Edge rate limiting + CORS for all `/api/*` (Next.js convention; must export `default function middleware()`)
- `src/lib/logger.ts` — production-safe logger (errors always print to runtime logs)
- `next.config.js` — CSP/security headers, no rewrites

## Cloudflare Deployment
The Vercel deploy job has been removed. Cloudflare deployment is not ready until a Worker workflow, cron replacement, Redis secrets, and production smoke tests are configured. Do not point `app.gstdtoken.com` at a new Worker until those checks pass.

Required GitHub Actions secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `KV_REST_API_URL`, and `KV_REST_API_TOKEN`. Configure values in GitHub/Cloudflare settings; never send or commit secret values. Keep the existing Upstash database to preserve stored data.

## Training Marketplace API (added 2026-07-04)
New endpoints in `src/pages/api/v1/training/`:
- `POST /api/v1/training/jobs` — submit fine-tuning job (model + dataset_url + domain)
- `GET  /api/v1/training/jobs?wallet=EQ...` — list jobs by wallet
- `GET  /api/v1/training/jobs/:id` — job status, progress, lora_url when done
- `POST /api/v1/training/gradient` — TrainingNode submits gradient (metacognitive_score ≥ 0.3)

Jobs push `required_caps: ["finetune"]` tasks to `tasks:queue`.
TrainingNode (gstd-a2a) picks them up via `/api/v1/tasks/poll`.
Job state stored in KV as `training:job:{job_id}` (7-day TTL).

## Do NOT
- Do not add `as any` casts in API routes — use proper types
- Do not import from `../../../../../lib/kv` (count levels from file location)
- Do not add rewrites pointing to `api.gstdtoken.com` — that backend doesn't exist
- Do not suppress errors in production — `logger.error()` always prints
