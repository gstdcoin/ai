# Contributing to GSTD

## Quick Start

```bash
git clone https://github.com/gstdcoin/ai.git && cd ai/frontend
npm install --legacy-peer-deps
npm run dev   # → http://localhost:3000
```

No KV credentials needed — `src/lib/kv.ts` falls back to in-memory store for local dev.

## Structure

| Directory | Language | Purpose |
|-----------|----------|---------|
| `frontend/` | Next.js 16 + TypeScript | Web dashboard & Telegram Web App |
| `frontend/src/pages/api/v1/` | TypeScript | Serverless API routes (Vercel) |
| `contracts/` | Tact (TON) | Smart contracts (token, settlement) |

## Architecture Rules

- All API logic lives in `src/pages/api/v1/` as Next.js serverless functions
- KV access only via `kvGet / kvSet / kvKeys / kvDel / kvIncr` from `src/lib/kv`
- No Go backend. No Docker in production. Hosted on Vercel.
- Rate limiting is handled by `src/middleware.ts` (Edge runtime)

## Running a Node (separate from this repo)

```bash
curl -fsSL https://raw.githubusercontent.com/gstdcoin/gstdbot/main/install.sh | bash
```

The node software lives in [gstdcoin/gstdbot](https://github.com/gstdcoin/gstdbot), not in this repo.

## Checks Before PR

```bash
cd frontend
npx tsc --noEmit   # No TypeScript errors
npm run lint       # No ESLint warnings
```

## Code Style

- **TypeScript**: ESLint + Prettier
- **Tact**: Follow existing contract patterns
- **Commits**: `feat:`, `fix:`, `docs:`, `test:`, `ci:` prefixes

## License

Apache 2.0
