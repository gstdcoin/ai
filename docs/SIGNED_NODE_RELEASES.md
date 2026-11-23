# Signed node releases

## Verified release and installed node — 2026-11-24 Asia/Qyzylorda

Approved version **3.7.3** is pinned to `c0ec226f9b64a3d0d8532b462ed9a0ce0d75d67c`. Node PRs [12](https://github.com/gstdcoin/gstdbot/pull/12) and [13](https://github.com/gstdcoin/gstdbot/pull/13), and platform PR [23](https://github.com/gstdcoin/ai/pull/23) passed type/unit/build, installer/container and CodeQL checks. The public new-domain manifest was verified with the unchanged `82a7b29c…` trust root. No release key was rotated.

The operator-authorized maintenance of the ARM node on server `bot` completed with a protected local backup and an independently verified fresh Ed25519 manifest. Its installed source matches the approved pin, health reports 3.7.3, and the signed update checker reports `update_available:false` and `can_apply:false`. Existing identity/wallet/PIN files and `.env` were preserved byte-for-byte. No PIN or private key was read into chat. Authenticated API routes continue returning 401 without a session.

Ollama reports three installed models and is available. Both public website and platform statistics show **one online node** after registration on `app.gstdtoken.xyz`. These checks do not establish GPU performance or an accepted paid inference/payout. They apply to the `bot` node; the distinct `gstd-desktop` owner-only rule is unchanged.

## Public release check — 2026-11-18

The live `/api/v1/nodes/update/manifest` endpoint returned approved version 3.7.2 at commit `ccf459cc31fde5872317bc291260561e63ebfe00`. Its fresh Ed25519 signature was verified against the pinned public root below. Main-branch source `ab7de386e4f27a8f8d026f9fa86ca1faf60eaa07` is a newer source state, not an automatically approved release. Installer/update hardening remains in [node PR 8](https://github.com/gstdcoin/gstdbot/pull/8).

This check reads public data only: it does not rotate a key, approve a new binary or update an installed daemon. See [readiness](READINESS.md) and the [review queue](REPOSITORY_MAINTENANCE.md).

## Signing contract

The updated operator dashboard checks the signed approval channel through its node and fetches a fresh manifest through authenticated `/api/node/update/manifest` after confirmation. It forwards that manifest to `/api/node/update`. The node keeps its existing PIN/session and Ed25519 signature gates, the 60-second window, exact fetched-commit binding, branch check, clean-source check, build validation and rollback. An already installed approved commit returns `up_to_date` without a build or restart.

The endpoint signs only `src/lib/nodeReleaseApproved.json`. Callers cannot select a commit or signing payload. This pin must be updated after the corresponding node commit passes CI. Unapproved branch commits are not advertised as installable releases; the approved object is fetched by its exact hash even when the branch has advanced. A newer/divergent local checkout is not silently downgraded. Version-check metadata uses the same approval pin and an immutable installer URL. A metadata/version response is not a signed release. See [node update diagnostics](https://github.com/gstdcoin/gstdbot/blob/main/docs/UPDATE_CHANNEL.md).

`PLATFORM_RELEASE_SIGNING_SEED` is a Worker runtime secret containing the ORIGINAL 32-byte Ed25519 release seed as 64 hexadecimal characters. It is not a TON mnemonic or wallet seed. The derived public key must match RELEASE_PUBLIC_KEY and the current approved node trust root. The original 1451788de786… root required the owner-approved recovery below. Missing, invalid or mismatched keys produce HTTP 503 and no manifest. Private values never appear in responses. Public manifests cache for five seconds; errors do not cache.

The historical incident before the recovery below was reproduced in the authenticated node dashboard: the node returned `Signed manifest required (PLATFORM_SIGNING_ENFORCED=true)`. Its server remained 3.7.0. Earlier UI-only fixes did not resolve that missing signer.

Historical recovery context: the original seed was unavailable in the checked configuration, so the documented owner-controlled trust recovery below was required. Restoring an original secret applies only to nodes still pinned to that original root. The current public signer uses the recovered root and passed the check above. Do not send seeds in chat, rotate them merely because an older seed is missing, or disable verification; a new random seed cannot authenticate to an unrelated pinned key.

No remote node restart is performed by this documentation or by publishing the endpoint. `gstd-desktop` remains an owner-only update action under AGENTS.md.


## Prepared owner-controlled recovery when the old key is unavailable

The recovery workflow is not a scheduled or automatic rotation. It runs only when an authorized maintainer publishes the specific `.github/release-recovery-approval.json` request after the owner's explicit approval. No such request is included by default. It must bind the current public key, exact production Worker, operation ID and a maximum one-hour window. Reruns are refused before key generation. Existing Cloudflare deployment access is used; its permissions are not expanded.

The runner creates a fresh dedicated Ed25519 release key in memory and uploads its seed only to `PLATFORM_RELEASE_SIGNING_SEED` using Wrangler stdin. Credentials are not passed on command lines, printed or written to artifacts. Only the new public key/fingerprint is exported. Tool installation has no deployment credentials and disables lifecycle scripts. This is a release key, not a TON wallet key; no blockchain transaction is made.

After reviewing the public artifact, the approved procedure pins the new public key in the node and platform, waits for CI, then performs ONE owner-authorized local maintenance build/restart to bridge the old trust root. A private configuration/dist backup has been prepared before asking for that approval. Node identity, external payout wallet and PIN remain unchanged. `PLATFORM_SIGNING_ENFORCED` remains enabled. Subsequent normal updates again require the fresh valid platform signature.

Creating the new release key and performing the one-time local maintenance update require a clear owner decision. Publishing this workflow, running its no-credential tests or preparing a backup does not perform either action. An unavailable old key must not be silently bypassed through another API route.

Recovery provenance: owner-approved request b496885f; GitHub Actions run 42111265164 successfully provisioned the dedicated release secret. New public root: 82a7b29cca0bff9cdd7ac285277af45287bce77066cf40548ca16ab34a63f30e. Node candidate: ccf459cc31fde5872317bc291260561e63ebfe00, version 3.7.2. Source pinning is complete and the public deployed signer was verified above; the installed daemon and any owner-authorized local restart require their own evidence. No wallet keys or financial transactions were involved.
