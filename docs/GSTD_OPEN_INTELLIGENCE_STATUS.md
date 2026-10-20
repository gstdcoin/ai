# GSTD Open Intelligence status

## Current checkpoint

The public Open Intelligence page, API, and latest collector diagnostics are deployed. The production dataset is still incomplete: it has snapshots for only `3/4` repositories and must not be described as a complete ecosystem baseline.

The narrow research question is:

> What recent commit activity is visible in the GSTD ecosystem repositories?

This is a repository-metadata dataset, not a measure of network activity, product usage, project quality, or demand. No contracts or `gstd-bridge` files were touched. The local follow-up patch described below has not been committed or deployed.

## Scope and data source

- Deployed source: GitHub REST API public repository metadata, unauthenticated. The local follow-up switches collection to unauthenticated GitHub Atom commit feeds because production exhausted the shared REST API quota.
- Local feed branches: `ai/main`, `gstdbot/main`, `A2A/master`, and `web/main`; all four public feed URLs returned HTTP 200 during read-only source checks.
- Feed collection ceiling: at most one request per repository per UTC day (four requests/day total); conditional requests use ETags when available.
- Retention: at most 180 daily snapshots per repository.
- Deployed REST fields: canonical repository URL, license SPDX identifier, archive flag, stars, forks, open-issue count, default branch, and source timestamps.
- Local feed fields: canonical repository URL, configured branch, up to 20 commit identifiers and timestamps, and the count of newly visible commits since the prior observation. Commit messages, authors, raw feed bodies, and source code are not retained. If consecutive feeds do not overlap, the count is explicitly marked as a lower bound.
- The API response exposes source attribution, collection policy, method, snapshot status, and explicit interpretation limits.
- The public data endpoint is `GET /api/v1/open-intelligence/ecosystem`; the page is `/open-intelligence`.
- The daily collection route requires `OPEN_INTELLIGENCE_CRON_SECRET`; the Cloudflare scheduled wrapper sends it as a bearer token. The secret must be configured as a Cloudflare Worker secret before the schedule can collect data. Do not put the secret in tracked Wrangler configuration.
- Cloudflare cron is configured for `17 4 * * *` (04:17 UTC daily) in both Wrangler configurations.
- The existing main-branch Cloudflare workflow now generates a fresh random cron secret in the runner and installs it as a Worker secret alongside Upstash credentials; it is masked and never written to tracked files.
- Preview CI now checks the Open Intelligence page, dataset schema and allowlist, and rejects unauthenticated collection calls.
- After production deployment, CI checks the public page, performs one authenticated bounded collection (at most four unauthenticated GitHub feed requests), then verifies that the public API exposes all four real snapshots.
- The initial implementation is commit `4fdfd93090b79272527ed9174e423ad659ecf17e`; collector resilience and diagnostics are deployed in `92f35bbc4d11ac8cecea3bf5e8a38dfb073eeca2`.
- The deployed follow-up sequences source requests with a one-second gap, records one attempt per repository per UTC day (including failed attempts), exposes available rate-limit headers in source errors, shows collection status/errors on the page, and improves CI failure output. It does not retry a failed source repeatedly on the same day.
- Because the REST quota was exhausted from Cloudflare egress even with sequential requests, the selected no-secret remedy is to measure visible commit activity from public Atom feeds rather than depend on an unauthenticated REST API quota. The local replacement uses a new dataset schema/algorithm version and separate KV keys, so old REST snapshots are not misrepresented as feed history.

## Changed files

- `frontend/src/lib/openIntelligence.ts` — source allowlist, Atom feed validation, bounded daily history, ETag collection, commit-delta derivation, provenance, and research status.
- `frontend/src/lib/openIntelligence.test.ts` — feed validation, privacy filtering, history, commit counts, lower-bound handling, request cap, daily deduplication, and ETag tests.
- `frontend/src/lib/openIntelligenceAuth.ts` and its test — constant-time bearer-secret validation; missing secret denies collection.
- `frontend/src/pages/api/cron/open-intelligence.ts` — authenticated collection API; reports skipped-after-attempt sources as incomplete.
- `frontend/src/pages/api/v1/open-intelligence/ecosystem.ts` — bounded public dataset API.
- `frontend/src/pages/open-intelligence.tsx` — localized public page with commit-activity metrics, baseline state, collection status/errors, history, source attribution, and limitations.
- `frontend/src/components/layout/EcosystemNav.tsx` and `frontend/public/locales/{en,ru}/common.json` — navigation and translations; the local patch adds collection status labels.
- `frontend/worker.ts`, `frontend/wrangler.jsonc`, and `frontend/wrangler.production.jsonc` — scheduled Worker entrypoint and daily cron.
- `.github/workflows/ci.yml` — protected collection configuration, preview checks, production baseline check, and detailed source-failure output.

## Verification

- GitHub Actions run `39407634700` initially deployed the page and failed its baseline check (`207`). Run `39409175837` passed frontend checks, security audit, remote Cloudflare build, preview checks, production deployment, and health checks; the baseline step correctly failed (`207`) because collection remained partial.
- Read-only production check after run `39409175837` on 2026-10-20: `/open-intelligence` returned HTTP 200; `/api/v1/open-intelligence/ecosystem` returned `complete: false` with snapshots for `3/4` repositories. `ai` and `A2A` were updated; `gstdbot` retained its existing same-day snapshot; `web` failed with `GitHub API rate limited (HTTP 403; remaining 0; retry after unknown)`.
- The Atom feed migration passes the full `npm.cmd test` suite: 42 Vitest tests and 11 Node tests.
- The four public Atom feed URLs were read-only checked: `ai/main`, `gstdbot/main`, `web/main`, and `A2A/master` returned HTTP 200.
- Focused Atom collector/auth tests passed (7 tests); `npx.cmd tsc --noEmit`, targeted ESLint, and English/Russian locale JSON parsing passed.
- `npm.cmd run build` passed after the feed-source migration; Next.js generated all 62 pages, including `/open-intelligence` and the public dataset API.
- The feed-source replacement is local and not yet deployed. No production feed collection was manually triggered during development.

## Known limitations / blockers

- Production currently has three REST-metadata snapshots; no complete four-repository baseline exists. The local feed collector starts a separate schema/history and must create its own baseline after deployment.
- At least one production request exhausted the unauthenticated GitHub REST API quota (`X-RateLimit-Remaining: 0`). Sequential requests did not avoid that shared-egress limit.
- Atom feeds expose only the newest 20 commits. When consecutive observations do not overlap, the collector reports the visible count as a lower bound instead of claiming an exact count.
- The feed collector has configured branch names; a future branch rename will surface as a source error until the allowlist is updated.
- A failed repository attempt is intentionally not retried until the next UTC day. If a production feed attempt is incomplete, wait for the next scheduled daily collection and inspect the public source diagnostics.
- Local Wrangler preview remains unverified on this Windows host; the GitHub Actions remote preview smoke tests passed for the deployed version.
- The previous Windows OpenNext build emitted traced-package copy errors before reaching “build complete”; a successful Next.js build does not prove the full Cloudflare bundle. Cloudflare's remote CI deployment remains the deployment check.
- GitHub commit feeds are a single-source view and do not prove production deployment, user activity, code quality, or project health.
- Daily snapshots will require a full day between observations before the page can show real trends.

## Next step

Finish the local feed-source migration: run the full frontend tests and production build, review the changed dataset schema/UI, then commit and push it to `main`. Verify CI deployment and check that the public API reports all four feed snapshots with `update_status.complete === true`. Do not report completion unless that production verification succeeds.
