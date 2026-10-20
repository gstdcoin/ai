# GSTD ecosystem implementation status

Status checked: 2026-10-20. Scope: `ai`, `gstdbot`, `A2A`, and `web`.
`contracts` and `gstd-bridge` remain out of scope and were not changed.

The Open Intelligence implementation and its data-collection method are tracked
separately in [GSTD_OPEN_INTELLIGENCE_STATUS.md](./GSTD_OPEN_INTELLIGENCE_STATUS.md).
It is deployed: the first production Atom-feed baseline covers all four tracked
repositories. A second daily observation is still needed before reporting trends.

## Verified

- `ai/frontend`: `npm.cmd test` passes (67 Vitest tests and 11 Node tests);
  `npx.cmd tsc --noEmit`, `npm.cmd run build`, and `npm.cmd run lint` pass. Lint
  reports warnings but no errors. The build includes both legacy worker API
  routes.
- `ai`: `node scripts/guard.mjs` passes (451 files checked).
- Shared-secret hardening is implemented locally, not committed or deployed:
  `matchesSecret`/`matchesAnySecret` use SHA-256 digests with
  `timingSafeEqual`. Ten admin API routes now use the shared helper; the new
  helper tests pass as part of the frontend suite.
- Existing authentication inputs were preserved. In particular, legacy
  settlement query-secret support remains; migrate any external callers before
  considering its removal.
- `gstdbot`: all 107 tests pass locally, and the latest main-branch CI checks
  passed. Docker
  workflow run [#278](https://github.com/gstdcoin/gstdbot/actions/runs/39277327914)
  completed successfully for commit `a6d876e`; the workflow builds and pushes
  `linux/amd64` and `linux/arm64` images.
- `A2A`: Node test suite passes (2/2). Broader Python SDK compatibility tests
  have not been run in this environment. Fixed a registration contract mismatch:
  current A2A/browser clients send `specs.capabilities` as a string array,
  while the API only read `specs.capabilities.models`, silently discarding
  those capabilities. Registration now accepts that array as well as the
  existing nested and top-level `models` forms; regression tests cover all
  three formats. The legacy worker queue routes now require a fresh signature
  when a node has a bound identity key, while keeping the unbound legacy-client
  path. The legacy submit route now rejects empty/error results before consuming
  the task assignment.
- `web`: `npm.cmd run type-check` passes.
- Licensing: `ai`, `web`, `gstdbot` and `A2A` moved from MIT/Apache-2.0 to the
  unmodified PolyForm Noncommercial License 1.0.0 plus an appended "GSTD Network
  Participation" permission (running nodes / receiving GSTD rewards is allowed;
  commercial products, hosting and competing networks need a separate license).
  Package metadata, READMEs, CONTRIBUTING and the public site now say
  "source-available" instead of "open source". `contracts` and `gstd-bridge`
  were intentionally not touched (the former still has no license file, the
  latter still says MIT) and need a separate decision. Earlier releases stay
  under their previous license, bundled third-party skills/models keep their
  own licenses, and the wording should be reviewed by a lawyer.
- Node OTA updates: the platform now publishes the latest node-client version
  (read from `gstdbot/main/package.json`, cached 1 h) in every heartbeat
  response (`update`) and at `GET /api/v1/nodes/update/check?version=x.y.z`
  (previously a 404 page), so the existing snapshot/build/rollback updater in
  `gstdbot` actually triggers. `AUTO_UPDATE=false` is now honored. Limitations:
  one attempt per session, updates track `main` (no signed rollout; manifest
  signing stays opt-in via `PLATFORM_SIGNING_ENFORCED`), and no operator-issued
  `update` command exists yet. Not verified on a live node (none online).
- `ai/frontend` Tailwind 4 migration (approved by the owner): ran the official
  `@tailwindcss/upgrade` tool, which converted the theme to CSS `@theme`, the
  custom component classes to `@utility`, and the PostCSS setup to
  `@tailwindcss/postcss`. `next build` succeeds, `tsc` and 69 unit tests pass,
  and the home page and Mini App render correctly (Mini App tabs fit at 320 px
  with no horizontal scroll). An `overrides` entry pins `postcss-selector-parser`
  to `^7.1.6` for `@tailwindcss/typography`, so `npm audit --omit=dev` now
  reports 0 vulnerabilities. The full audit still lists 5 high dev-only
  advisories from `braces` via `eslint-config-next`'s `fast-glob` (no patched
  `braces` exists); they never reach the production bundle. Known limitation:
  Tailwind 4 targets Safari 16.4+/Chrome 111+, so very old Telegram WebViews may
  render degraded styles.
- `ai/frontend` dependency audit (earlier state): upgraded Vitest to `4.1.11` (supports the
  repository's Node 20 CI) to remove the two critical test-runner advisories;
  removed a stale `undici` v5 override so Wrangler resolves its declared
  patched v7 dependency. Current full audit still reports 7 high and 3 moderate
  issues in development/build tooling (Tailwind 3 / its glob dependencies,
  Next ESLint tooling, and CSS selector parsing). Production-only audit reports
  2 moderate CSS parser advisories and no high/critical issues. All 7 high
  advisories trace to `braces` (via Tailwind 3 and `eslint-config-next`'s
  `fast-glob`), which has no patched release upstream (latest 3.0.3 is
  affected), so no version bump can clear them; Tailwind 4 would remove only the
  Tailwind share and risks UI regressions (`@apply` of custom classes, changed
  border/ring defaults, older Telegram WebViews). They are a build-time DoS on
  trusted glob patterns, accepted until `braces` is patched. The CI audit job
  now runs `npm audit --omit=dev --audit-level=high` without `|| true`, so any
  high/critical advisory in production dependencies fails the job.
- Release: commit
  [`b348539`](https://github.com/gstdcoin/ai/commit/b3485397de69f2a78b1e8e390ef98b6c71c47c32)
  was pushed to `main`. GitHub Actions
  [run #673](https://github.com/gstdcoin/ai/actions/runs/39420560078) passed all
  jobs, including the Linux Cloudflare build, preview health/page/API checks,
  production deploy, and production health verification.
- Post-deploy smoke checks on `app.gstdtoken.com` returned HTTP 200 for health,
  TMA, Open Intelligence page, and its public API. CI also collected and
  verified a four-repository Open Intelligence baseline. The apex
  `gstdtoken.com` is the separate Cloudflare marketing site (`web` repo) with
  its own `/api/health` (HTTP 200); the platform API intentionally lives only on
  `app.gstdtoken.com`, so `gstdtoken.com/api/v1/health` returning 404 is by
  design. Routing `/api/*` from the apex was deliberately not done: the site's
  live chat is designed to stay independent of the platform worker.
- `gstd-mcp-server`: `npm audit fix` (lockfile only, no major bumps) cleared
  its 1 critical (`proxy-addr`), 3 high and 3 moderate advisories; `npm run
  build` passes. `contracts/` manifests were intentionally left untouched.
- Read-only production network check: 0 nodes online, 10 registered nodes
  offline, and 0 tasks. The network therefore has no active task workload.

## Current work and release boundary

The `ai` changes now deployed include constant-time secret comparisons,
node-capabilities registration compatibility, and task-route authorization /
result validation. The browser worker also filters polling to supported
`sha256_verify` payloads, leaves unsupported work queued, retries registration
after failure, prevents overlapping polls, and refreshes its 10-minute node
lease with a signed heartbeat every 3 minutes. Tests, TypeScript, lint, and
Next.js build were rerun successfully after the dependency updates. Local
OpenNext Cloudflare packaging fails on Windows with `EPERM` creating a
dependency symlink; the Linux CI build and preview/deploy gates passed for the
published commit.

## Remaining blockers and next steps

1. Keep presence rewards disabled while there are no online workers or validated
   tasks. Do not treat registration as proof of useful work or enable payouts
   without a real task source and successful verification.
2. Verify a real Linux/Raspberry Pi node startup and recovery. The ARM64 image
   build is verified in CI, but no physical-device runtime test has been done.
3. Run a production end-to-end task through a live node, including task
   assignment, verification, and settlement, once a node and funded/authorized
   task source are available. Production KV behavior is not verified by the
   local tests.
4. Expand A2A compatibility coverage against the current task API. The existing
   two Node tests and targeted API tests do not establish full SDK/Python
   compatibility; Python is unavailable in this environment.
5. Check the next scheduled Open Intelligence collection at 04:17 UTC on
   2026-10-21. Confirm all four sources and a second observation before
   describing commit trends.
6. Legacy unbound node heartbeats remain accepted for compatibility with older
   clients. Do not require signatures from every node until client migration is
   understood and tested.
7. Keep the legacy query-secret migration separate from the constant-time
   comparison change to avoid breaking existing callers.

This status records targeted implementation checks and known operational
blockers; it is not a claim that every line of every repository received a
fresh security audit. No contracts, `gstd-bridge`, paid operations, or
production changes were included.
