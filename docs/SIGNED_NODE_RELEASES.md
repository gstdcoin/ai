# Signed node releases

The operator dashboard requests `/api/v1/nodes/update/manifest` only after confirmation and forwards its manifest to `/api/node/update`. The node keeps its existing PIN/session and Ed25519 signature gates, the 60-second window, exact fetched-commit binding, clean-source check, build validation and rollback.

The endpoint signs only `src/lib/nodeReleaseApproved.json`. Callers cannot select a commit or signing payload. This pin must be updated after the corresponding node commit passes CI; a newer unapproved branch HEAD fails closed rather than bypassing the pin. A metadata/version response is not a signed release.

`PLATFORM_RELEASE_SIGNING_SEED` is a Worker runtime secret containing the ORIGINAL 32-byte Ed25519 release seed as 64 hexadecimal characters. It is not a TON mnemonic or wallet seed. The derived public key must equal `1451788de7861b5b2dc31073606bdbab337682fe7acb74b317ad34e60ecd2a75`, which is already pinned in installed nodes. Missing, invalid or mismatched keys produce HTTP 503 and no manifest. Private values never appear in responses. Public manifests cache for five seconds; errors do not cache.

The current incident was reproduced in the authenticated node dashboard: the node returned `Signed manifest required (PLATFORM_SIGNING_ENFORCED=true)`. Its server remained 3.7.0. Earlier UI-only fixes did not resolve that missing signer.

The original seed has not been located in the checked server configuration. The owner must restore it in Cloudflare Workers & Pages → gstd-ai-platform → Settings → Variables and Secrets → Secret `PLATFORM_RELEASE_SIGNING_SEED`, then Deploy. Do not send it in chat or put it in Git. Adding a new random seed cannot authenticate to the old pinned key. If the original seed is lost, a separate owner-controlled local trust-recovery procedure is required; changing the public key or disabling enforcement behind the owner's back is not a recovery mechanism.

No remote node restart is performed by this documentation or by publishing the endpoint. `gstd-desktop` remains an owner-only update action under AGENTS.md.


## Prepared owner-controlled recovery when the old key is unavailable

The recovery workflow is not a scheduled or automatic rotation. It runs only when an authorized maintainer publishes the specific `.github/release-recovery-approval.json` request after the owner's explicit approval. No such request is included by default. It must bind the current public key, exact production Worker, operation ID and a maximum one-hour window. Reruns are refused before key generation. Existing Cloudflare deployment access is used; its permissions are not expanded.

The runner creates a fresh dedicated Ed25519 release key in memory and uploads its seed only to `PLATFORM_RELEASE_SIGNING_SEED` using Wrangler stdin. Credentials are not passed on command lines, printed or written to artifacts. Only the new public key/fingerprint is exported. Tool installation has no deployment credentials and disables lifecycle scripts. This is a release key, not a TON wallet key; no blockchain transaction is made.

After reviewing the public artifact, the approved procedure pins the new public key in the node and platform, waits for CI, then performs ONE owner-authorized local maintenance build/restart to bridge the old trust root. A private configuration/dist backup has been prepared before asking for that approval. Node identity, external payout wallet and PIN remain unchanged. `PLATFORM_SIGNING_ENFORCED` remains enabled. Subsequent normal updates again require the fresh valid platform signature.

Creating the new release key and performing the one-time local maintenance update require a clear owner decision. Publishing this workflow, running its no-credential tests or preparing a backup does not perform either action. An unavailable old key must not be silently bypassed through another API route.
