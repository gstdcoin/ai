# GSTD Open Intelligence status

## Current checkpoint

Implemented a local, uncommitted MVP for a narrow research question:

> What is the recent public repository update footprint of the GSTD ecosystem?

This is a repository-metadata dataset, not a measure of network activity, product usage, project quality, or demand. No contracts or `gstd-bridge` files were touched. Nothing was committed, pushed, or deployed.

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
- After production deployment, CI checks the public page, performs one authenticated bounded collection (at most four unauthenticated GitHub REST requests), then verifies that the public API exposes all four real snapshots. This creates the first genuine baseline instead of fabricating or waiting for the nightly schedule.

## Changed files

- `frontend/src/lib/openIntelligence.ts` — source allowlist, metadata validation, bounded daily history, ETag collection, change derivation, provenance, and research status.
- `frontend/src/lib/openIntelligence.test.ts` — normalization, history, deltas, request cap, daily deduplication, and ETag tests.
- `frontend/src/lib/openIntelligenceAuth.ts` and its test — constant-time bearer-secret validation; missing secret denies collection.
- `frontend/src/pages/api/cron/open-intelligence.ts` — authenticated collection API.
- `frontend/src/pages/api/v1/open-intelligence/ecosystem.ts` — bounded public dataset API.
- `frontend/src/pages/open-intelligence.tsx` — localized public page with baseline state, history, source attribution, and limitations.
- `frontend/src/components/layout/EcosystemNav.tsx` and `frontend/public/locales/{en,ru}/common.json` — navigation and translations.
- `frontend/worker.ts`, `frontend/wrangler.jsonc`, and `frontend/wrangler.production.jsonc` — scheduled Worker entrypoint and daily cron.

## Verification

- `npx.cmd vitest run src/lib/openIntelligence.test.ts src/lib/openIntelligenceAuth.test.ts` — passed, 5 tests.
- `npm.cmd test` — passed, 40 Vitest tests and 11 Node tests.
- `npx.cmd tsc --noEmit` — passed.
- `npm.cmd run build` — passed; Next.js compiled and generated all 62 static pages, including the public Open Intelligence page and API route output.
- Workflow YAML parsing and Bash syntax validation for the modified deployment/smoke-test steps — passed.
- Locale and Wrangler JSON parsing — passed.
- `npx.cmd wrangler types --config wrangler.jsonc` — passed.
- `npm.cmd run lint` — exit code 0; repository has existing React/ESLint warnings in unrelated files. Targeted lint for changed code has no errors; only the existing `<img>` warning in `EcosystemNav.tsx` remains.
- Local development smoke test — `/open-intelligence` returned 200 and rendered its title; the public dataset endpoint returned the expected four allowlisted repository slots in `awaiting_first_collection`; unauthenticated cron POST returned 401.
- `npm.cmd run cf:build` — Next.js compilation, type checking, static page generation (62 pages, including `/open-intelligence`), and OpenNext's final “build complete” were reached after a temporary, local-only fallback copied traced dependencies when Windows denied symlink creation. OpenNext logged multiple `ERROR Failed to copy` messages for traced packages before producing `.open-next/worker.js`; the bundle's completeness is therefore not established. The installed OpenNext file was restored immediately after the build; no dependency or manifest changes remain. OpenNext warns that Windows is not fully supported.
- `npx.cmd wrangler deploy --dry-run` using a temporary config without the remote AI binding — passed; Wrangler compiled the custom `worker.ts` entrypoint, cron binding, and assets bundle (12,143.78 KiB uncompressed; 2,494.29 KiB gzip). Dry run did not deploy.
- Wrangler preview started, but requests to both the custom wrapper and direct OpenNext entrypoint, including the local scheduled-test URL, timed out without a response. No preview request succeeded.
- No live GitHub collection, production KV write, or production request was made. No real cron secret was configured.
- Live check on 2026-10-20: `https://app.gstdtoken.com/api/v1/health` returns 200, while `https://app.gstdtoken.com/open-intelligence` still returns 404. The new page and workflow changes are local and have not yet been pushed/deployed.

## Known limitations / blockers

- The first real collection remains pending deployment; the updated CI pipeline will create it after the production route deploys.
- Local Wrangler preview remains unverified on this Windows host; the GitHub Actions remote preview smoke tests must pass before the workflow proceeds to production deployment.
- OpenNext logged multiple traced-package copy errors while emitting a bundle; dry-run compilation alone does not prove those dependencies are present or that the Worker will behave correctly.
- The local `wrangler dev` preview starts, but HTTP requests and the scheduled-test URL both time out without a response, with both the custom wrapper and direct OpenNext worker entrypoint. The Worker runtime path therefore remains unverified on this host.
- WSL is not installed on this host, so the recommended local build alternative is currently unavailable.
- The preview configs used for isolated testing were removed after use. No secret was configured, no schedule was triggered against GitHub, and no collection ran.
- GitHub metadata is a single-source view. `pushed_at` is not proof of meaningful changes, production deployment, user activity, or project health.
- Daily snapshots will require a full day between observations before the page can show real trends.

## Next step

Run the validated main-branch CI/deployment workflow, monitor the remote preview tests, and verify the production page, authenticated initial collection, and public baseline API. The user's latest request authorizes making this public, but the local changes remain unpublished until that workflow runs.
