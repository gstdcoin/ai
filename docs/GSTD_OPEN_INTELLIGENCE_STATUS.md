# GSTD Open Intelligence status

## Current checkpoint

The public Open Intelligence page, API, and tokenless commit-feed collector are deployed. The first production Atom-feed collection completed successfully for all `4/4` repositories. The baseline is real but needs a second daily observation before trend deltas are available.

The narrow research question is:

> What recent commit activity is visible in the GSTD ecosystem repositories?

This is a commit-activity dataset, not a measure of network activity, product usage, project quality, or demand. No contracts or `gstd-bridge` files were touched.

## Scope and data source

- Source: unauthenticated GitHub Atom commit feeds.
- Tracked branches: `ai/main`, `gstdbot/main`, `A2A/master`, and `web/main`.
- Feed collection ceiling: at most one request per repository per UTC day (four requests/day total); conditional requests use ETags when available.
- Retention: at most 180 daily snapshots per repository.
- Stored/published fields: canonical repository URL, configured branch, up to 20 commit identifiers and timestamps, and the count of newly visible commits since the prior observation. Commit messages, authors, raw feed bodies, and source code are not retained. If consecutive feeds do not overlap, the count is explicitly marked as a lower bound.
- The API response exposes source attribution, collection policy, method, snapshot status, and explicit interpretation limits.
- The public data endpoint is `GET /api/v1/open-intelligence/ecosystem`; the page is `/open-intelligence`.
- The daily collection route requires `OPEN_INTELLIGENCE_CRON_SECRET`; the Cloudflare scheduled wrapper sends it as a bearer token. The secret must be configured as a Cloudflare Worker secret before the schedule can collect data. Do not put the secret in tracked Wrangler configuration.
- Cloudflare cron is configured for `17 4 * * *` (04:17 UTC daily) in both Wrangler configurations.
- The existing main-branch Cloudflare workflow now generates a fresh random cron secret in the runner and installs it as a Worker secret alongside Upstash credentials; it is masked and never written to tracked files.
- Preview CI now checks the Open Intelligence page, dataset schema and allowlist, and rejects unauthenticated collection calls.
- After production deployment, CI checks the public page, performs one authenticated bounded collection (at most four unauthenticated GitHub feed requests), then verifies that the public API exposes all four real snapshots.
- The initial implementation is commit `4fdfd93090b79272527ed9174e423ad659ecf17e`; collector resilience and diagnostics are deployed in `92f35bbc4d11ac8cecea3bf5e8a38dfb073eeca2`.
- Commit `356b1f736281bd58a350ad52f88e40fbc7678b45` switches to the feed source, schema version 2, and separate KV keys so REST snapshots are not misrepresented as feed history.
- The collector sequences source requests with a one-second gap, records one attempt per repository per UTC day (including failed attempts), shows collection status/errors on the page, and does not retry a failed source repeatedly on the same day.
- The REST source was replaced after Cloudflare egress exhausted GitHub's unauthenticated REST quota. The feed source needs no GitHub credential and was chosen to preserve free-tier operation.

## Changed files

- `frontend/src/lib/openIntelligence.ts` — source allowlist, Atom feed validation, bounded daily history, ETag collection, commit-delta derivation, provenance, and research status.
- `frontend/src/lib/openIntelligence.test.ts` — feed validation, privacy filtering, history, commit counts, lower-bound handling, request cap, daily deduplication, and ETag tests.
- `frontend/src/lib/openIntelligenceAuth.ts` and its test — constant-time bearer-secret validation; missing secret denies collection.
- `frontend/src/pages/api/cron/open-intelligence.ts` — authenticated collection API; reports skipped-after-attempt sources as incomplete.
- `frontend/src/pages/api/v1/open-intelligence/ecosystem.ts` — bounded public dataset API.
- `frontend/src/pages/open-intelligence.tsx` — localized public page with commit-activity metrics, baseline state, collection status/errors, history, source attribution, and limitations.
- `frontend/src/components/layout/EcosystemNav.tsx` and `frontend/public/locales/{en,ru}/common.json` — navigation and localized collection status/commit metrics.
- `frontend/worker.ts`, `frontend/wrangler.jsonc`, and `frontend/wrangler.production.jsonc` — scheduled Worker entrypoint and daily cron.
- `.github/workflows/ci.yml` — protected collection configuration, preview checks, production baseline check, and detailed source-failure output.

## Verification

- GitHub Actions run `39407634700` initially deployed the page and failed its baseline check (`207`). Run `39409175837` deployed diagnostics, exposed the exhausted REST quota, and correctly failed the partial baseline check. Run `39411375399` passed frontend checks, security audit, remote Cloudflare build, preview checks, production deployment, health checks, and the Open Intelligence baseline step.
- Read-only production check after run `39411375399` on 2026-10-20: `/open-intelligence` returned HTTP 200 and rendered the commit-activity UI; `/api/v1/open-intelligence/ecosystem` returned schema version 2, `update_status.complete: true`, and snapshots for `4/4` repositories. Each feed returned 20 entries; `ai` latest commit was 2026-10-20 and the other three latest commits were 2026-10-19.
- The Atom feed migration passes the full `npm.cmd test` suite: 42 Vitest tests and 11 Node tests.
- The four public Atom feed URLs were read-only checked: `ai/main`, `gstdbot/main`, `web/main`, and `A2A/master` returned HTTP 200.
- Focused Atom collector/auth tests passed (7 tests); `npx.cmd tsc --noEmit`, targeted ESLint, and English/Russian locale JSON parsing passed.
- `npm.cmd run build` passed after the feed-source migration; Next.js generated all 62 pages, including `/open-intelligence` and the public dataset API.
- The feed-source replacement is deployed and its initial production collection is verified. Collection was only triggered by the authenticated deployment workflow, not manually.

## Known limitations / blockers

- The old REST dataset had three snapshots; it is intentionally isolated from the version-2 feed dataset. The new production feed dataset now has its own complete four-repository baseline.
- At least one production request exhausted the unauthenticated GitHub REST API quota (`X-RateLimit-Remaining: 0`). Sequential requests did not avoid that shared-egress limit.
- Atom feeds expose only the newest 20 commits. When consecutive observations do not overlap, the collector reports the visible count as a lower bound instead of claiming an exact count.
- The feed collector has configured branch names; a future branch rename will surface as a source error until the allowlist is updated.
- A failed repository attempt is intentionally not retried until the next UTC day. If a production feed attempt is incomplete, wait for the next scheduled daily collection and inspect the public source diagnostics.
- Local Wrangler preview remains unverified on this Windows host; the GitHub Actions remote preview smoke tests passed for the deployed version.
- The previous Windows OpenNext build emitted traced-package copy errors before reaching “build complete”; a successful Next.js build does not prove the full Cloudflare bundle. Cloudflare's remote CI deployment remains the deployment check.
- GitHub commit feeds are a single-source view and do not prove production deployment, user activity, code quality, or project health.
- Daily snapshots will require a full day between observations before the page can show real trends.

## Next step

Verify the next scheduled collection (`04:17 UTC` on 2026-10-21) and confirm that the second observation preserves all four sources and produces meaningful commit deltas. The baseline and public UI are verified; do not claim activity trends until that second observation exists.
