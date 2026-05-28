# GSTD Platform — Development Guide

## Stack
- **Framework**: Next.js 16 (Pages Router), TypeScript, Tailwind CSS
- **State / DB**: Upstash Redis via `@vercel/kv` — all in `src/lib/kv.ts`
- **Hosting**: Vercel (serverless). No Go backend. No Docker in production.
- **Wallets**: TON Connect, MetaMask, Phantom

## Local Dev
```bash
cd frontend
npm install --legacy-peer-deps
npm run dev   # → http://localhost:3000
```
No KV credentials needed — `src/lib/kv.ts` falls back to in-memory store.

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
- `src/lib/logger.ts` — production-safe logger (errors always print to Vercel Logs)
- `next.config.js` — CSP/security headers, no rewrites

## Vercel Deployment
Set these env vars in Vercel dashboard:
- `KV_REST_API_URL` + `KV_REST_API_TOKEN` — from Vercel KV (Storage tab)
- `TREASURY_SECRET` — any random string
- `NEXT_PUBLIC_TON_VAULT` / `NEXT_PUBLIC_SOL_VAULT` / `NEXT_PUBLIC_XRP_VAULT` — after contract deploy

## Do NOT
- Do not add `as any` casts in API routes — use proper types
- Do not import from `../../../../../lib/kv` (count levels from file location)
- Do not add rewrites pointing to `api.gstdtoken.com` — that backend doesn't exist
- Do not suppress errors in production — `logger.error()` always prints
