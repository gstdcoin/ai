# Signed node releases

The operator dashboard requests `/api/v1/nodes/update/manifest` only after confirmation and forwards its manifest to `/api/node/update`. The node keeps its existing PIN/session and Ed25519 signature gates, the 60-second window, exact fetched-commit binding, clean-source check, build validation and rollback.

The endpoint signs only `src/lib/nodeReleaseApproved.json`. Callers cannot select a commit or signing payload. This pin must be updated after the corresponding node commit passes CI; a newer unapproved branch HEAD fails closed rather than bypassing the pin. A metadata/version response is not a signed release.

`PLATFORM_RELEASE_SIGNING_SEED` is a Worker runtime secret containing the ORIGINAL 32-byte Ed25519 release seed as 64 hexadecimal characters. It is not a TON mnemonic or wallet seed. The derived public key must equal `1451788de7861b5b2dc31073606bdbab337682fe7acb74b317ad34e60ecd2a75`, which is already pinned in installed nodes. Missing, invalid or mismatched keys produce HTTP 503 and no manifest. Private values never appear in responses. Public manifests cache for five seconds; errors do not cache.

The current incident was reproduced in the authenticated node dashboard: the node returned `Signed manifest required (PLATFORM_SIGNING_ENFORCED=true)`. Its server remained 3.7.0. Earlier UI-only fixes did not resolve that missing signer.

The original seed has not been located in the checked server configuration. The owner must restore it in Cloudflare Workers & Pages → gstd-ai-platform → Settings → Variables and Secrets → Secret `PLATFORM_RELEASE_SIGNING_SEED`, then Deploy. Do not send it in chat or put it in Git. Adding a new random seed cannot authenticate to the old pinned key. If the original seed is lost, a separate owner-controlled local trust-recovery procedure is required; changing the public key or disabling enforcement behind the owner's back is not a recovery mechanism.

No remote node restart is performed by this documentation or by publishing the endpoint. `gstd-desktop` remains an owner-only update action under AGENTS.md.
