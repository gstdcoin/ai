# GSTD Open Intelligence status

## Current checkpoint

The public Open Intelligence MVP is deployed, but its first production collection is incomplete. The page and public dataset API are online; the dataset must not be described as a complete ecosystem baseline yet.

The narrow research question is:

> What is the recent public repository update footprint of the GSTD ecosystem?

This is a repository-metadata dataset, not a measure of network activity, product usage, project quality, or demand. No contracts or `gstd-bridge` files were touched. The local follow-up patch described below has not been committed or deployed.

## Scope and data source

- Source: GitHub REST API public repository metadata, unauthenticated.
- Fixed allowlist: `gstdcoin/ai`, `gstdcoin/gstdbot`, `gstdcoin/A2A`, and `gstdcoin/web`.
- Collection ceiling: at most one request per repository per UTC day (four requests/day total); conditional requests use ETags when available.
- Retention: at most 180 daily snapshots per repository.
- Stored/published fields: canonical repository URL, license SPDX identifier, archive flag, stars, forks, open-issue count, default branch, and source timestamps. Raw GitHub response bodies, code, issue/release text, and user data are not retained.
- The API response exposes source attribution, collection/rate-limit policy, method, snapshot status, and explicit interpretation limits.
- The public data endpoint is `GET /api/v1/open-intelligence/ecosystem`; the page is `/open-intelligence`.
- The daily collection route requires `OPEN_INTELLIGENCE_CRON_SECRET`; the Cloudflare scheduled wrapper sends it as a bearer token. The secret must be configured as a Cloudflare Worker secret before the schedule can collect data. Do not put the secret in tracked Wrangler configuration.
- Cloudflare cron is configured for `17 4 * * *` (04:17 UTC daily) in both Wrangler configurations.
- The existing main-branch Cloudflare workflow now generates a fresh random cron secret in the runner and installs it as a Worker secret alongside Upstash credentials; it is masked and never written to tracked files.
- Preview CI now checks the Open Intelligence page, dataset schema and allowlist, and rejects unauthenticated collection calls.
- After production deployment, CI checks the public page, performs one authenticated bounded collection (at most four unauthenticated GitHub REST requests), then verifies that the public API exposes all four real snapshots.
- The published implementation is commit `4fdfd93090b79272527ed9174e423ad659ecf17e` on `main`. Its deployment completed, but the baseline step failed on a partial collection.
- The uncommitted follow-up sequences source requests with a one-second gap, records one attempt per repository per UTC day (including failed attempts), exposes GitHub rate-limit headers in source errors, shows collection status/errors on the page, and improves CI failure output. It does not retry a failed source repeatedly on the same day.

## Changed files

- `frontend/src/lib/openIntelligence.ts` — source allowlist, metadata validation, bounded daily history, ETag collection, change derivation, provenance, and research status.
- `frontend/src/lib/openIntelligence.test.ts` — normalization, history, deltas, request cap, daily deduplication, ETag, sequential request order, and failed-attempt tests.
- `frontend/src/lib/openIntelligenceAuth.ts` and its test — constant-time bearer-secret validation; missing secret denies collection.
- `frontend/src/pages/api/cron/open-intelligence.ts` — authenticated collection API; reports skipped-after-attempt sources as incomplete.
- `frontend/src/pages/api/v1/open-intelligence/ecosystem.ts` — bounded public dataset API.
- `frontend/src/pages/open-intelligence.tsx` — localized public page with baseline state, collection status/errors, history, source attribution, and limitations.
- `frontend/src/components/layout/EcosystemNav.tsx` and `frontend/public/locales/{en,ru}/common.json` — navigation and translations; the local patch adds collection status labels.
- `frontend/worker.ts`, `frontend/wrangler.jsonc`, and `frontend/wrangler.production.jsonc` — scheduled Worker entrypoint and daily cron.
- `.github/workflows/ci.yml` — protected collection configuration, preview checks, production baseline check, and detailed source-failure output.

## Verification

- GitHub Actions run `39407634700`: frontend and security audit passed; preview smoke tests and Cloudflare deployment/health checks passed; the production collection check failed because the result was partial (`207`).
- Read-only production check on 2026-10-20: `/open-intelligence` returned HTTP 200; `/api/v1/open-intelligence/ecosystem` returned the expected dataset with `complete: false` and snapshots for `1/4` repositories. `gstdbot` was collected; `ai`, `A2A`, and `web` returned HTTP 403. The cause of those 403 responses has not been established.
- After the latest local follow-up edits, `npm.cmd test` passed: 41 Vitest tests and 11 Node tests.
- `npx.cmd tsc --noEmit` — passed.
- Targeted ESLint for the changed collector, page, API, and tests passed.
- `npm.cmd run build` passed before the final small control-flow and test-timeout adjustment; rerun it before publishing the current patch.
- The follow-up patch has not yet been pushed, deployed, or verified against production. No production collection was manually triggered during this continuation.

## Known limitations / blockers

- Production currently has only one real repository snapshot; no complete four-repository baseline exists.
- The production 403 responses are not yet attributable to primary rate limiting, secondary rate limiting, or another GitHub restriction. The updated collector will expose available rate-limit headers on the next attempted collection.
- A failed repository attempt is intentionally not retried until the next UTC day. If the next production attempt remains incomplete, wait for the scheduled next-day collection and inspect its source diagnostics.
- Local Wrangler preview remains unverified on this Windows host; the GitHub Actions remote preview smoke tests passed for the deployed version.
- The previous Windows OpenNext build emitted traced-package copy errors before reaching “build complete”; a successful Next.js build does not prove the full Cloudflare bundle. Cloudflare's remote CI deployment remains the deployment check.
- GitHub metadata is a single-source view. `pushed_at` is not proof of meaningful changes, production deployment, user activity, or project health.
- Daily snapshots will require a full day between observations before the page can show real trends.

## Next step

Rerun the production build after the final local edits, review the full diff, then commit and push the follow-up to `main` (the user's request authorizes publication). Monitor GitHub Actions and verify the public page and dataset after deployment. Do not report completion until the public API shows all four repository snapshots and `update_status.complete === true`; otherwise record the actual source errors and next scheduled retry.
