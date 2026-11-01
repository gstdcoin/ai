# Production review — 2 November 2026

This release closes legacy entrypoints that bypassed current platform controls.

- Telegram Mini App identity fails closed without the bot token, verifies a fresh HMAC, rejects duplicate fields and decodes user JSON once.
- Model-pull compatibility requests use the existing owner-authenticated, bounded node queue. Arbitrary target URLs never cause a download.
- Node deregistration requires the bound node signature and a root node identifier; public wallet strings cannot remove another node or its queue.
- Batch inference uses canonical completion policy for every item (enterprise model/RPM/usage and funded wallet accounting). Batches are bounded to three prompts and require a retry key. A retry key must be reused with the same ordered body for paid retries.
- The unauthenticated legacy statistics/reward backfill is retired (410). Network statistics and the authenticated finance cron remain canonical.
- Public install.sh and ignite now forward to the single gstdbot installer; no demo identities or unverifiable welcome rewards.
- The old task widget links to working chat and funded-task API documentation instead of absent estimate/payment routes. Wallet disconnect clears the browser's stored platform session.
- Removed obsolete bridge/skill-count metadata and a historical PostgreSQL password fallback. Any historical reuse of that password requires owner review/rotation; removing source does not rotate credentials or erase history.

Validation: full platform tests and TON proof checks, TypeScript, Guard, installer syntax and git diff checks. Standalone contract clean build passes all 33 sandbox tests; this does not change deployed contract code or prove a mainnet payment.

Production boundaries remain explicit: one observed physical node, no verified mainnet funded deposit/work/withdrawal cycle, external owner signature for outgoing custody transfers, experimental/deferred bridge and training. Free service work creates no token rewards. Rewards are only for funded accepted work, split 85% executor / 10% protocol / 5% reserve, with no additional GSTD claim fee. No unfunded balance, model download, wallet transaction or secret rotation is part of this release.
