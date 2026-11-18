# Free isolated Redis release checks

Production uses its existing `KV_REST_API_URL` and `KV_REST_API_TOKEN`. The deploy job still rejects a preview URL with the same origin or the same token. No test creates balances in production or changes GitHub repository secrets.

If both owner-configured `PREVIEW_KV_REST_API_URL` and `PREVIEW_KV_REST_API_TOKEN` exist, CI uses that separate database. A partial configuration fails. Otherwise the job creates an empty, account-free temporary Upstash database using the [official API](https://upstash.com/docs/redis/overall/getstarted). Upstash deletes it after 72 hours. This is disposable release-check storage, never customer backing. Creation errors and rate limits stop the release; CI does not rotate identities or reuse production storage.

Credentials are masked before SDK probes and supplied through job-scoped `GITHUB_ENV` and preview Worker secrets. The production secret step continues to use only the original production bindings. No token or provider database descriptor is committed, printed in an error or uploaded as an artifact.

When the owner has configured the GitHub secret `ESCROW_MAINNET_TONCENTER_API_KEY`, the production step first reads configuration parameter 19 through the fixed Toncenter mainnet endpoint and verifies global ID `-239`. Only then does it forward the key to the production Worker with the other runtime secrets. A missing optional input preserves an existing Worker binding; an invalid key/network blocks publication. A post-deploy catalog check confirms `rpc_configured: true` when a key was supplied. This read-only probe does not sign, broadcast or activate a contract.

If a completed deployment logs `No repository RPC key supplied` and the catalog still reports `rpc_configured:false`, save that secret in [gstdcoin/ai Actions secrets](https://github.com/gstdcoin/ai/settings/secrets/actions), then run the CI workflow on main again. The secret value belongs in GitHub settings, never chat, a source commit or a workflow input. Preview isolation and normal platform health do not depend on this optional mainnet RPC credential.

## Preview access

The preview configuration sets `GSTD_PRIVATE_PREVIEW=true`, has no crons, and runs the Worker before static assets. All requests, including wallet manifests and cached pages, require a random 256-bit `x-gstd-preview-key`. The Worker rejects requests before application dispatch when the key/expiry is missing, incorrect or expired. Access expires 30 minutes after provisioning; ordinary public requests get 403. Requests and responses reaching the app do not carry the capability header; successful preview responses use `private, no-store`. Preview discovery bypasses the shared public-response cache. Production has no private-preview flag.

CI verifies anonymous rejection, then authenticated Redis health, discovery, rendered pages, dataset shape, cron authorization and wallet manifests. Its helper follows redirects only inside the exact workers.dev origin so the capability cannot be forwarded to another site. Provider deletion after 72 hours cannot expose a public finance UI because the preview access has already expired. Every subsequent deployment gets a fresh capability and, by default, a new empty database.

## Repeatable checks

With Node 22 and the lockfile installed:

```sh
cd frontend
node tests/moneyRest.test.cjs --create-free-database
node tests/moneyRedis.test.cjs
```

The REST test creates its own disposable database, separate from deployment preview. It uses the real Upstash SDK and production `money:v2` Lua/CAS path, with production memory fallback disabled. A loopback proxy forwards real Redis responses and injects network cuts. Checks cover:

- `SET NX PX`: one lease winner among 16 callers, expiry and owner-checked unlock.
- Atomic signed-failure recording, reservation races, 85/10/5 capture, replay conflicts and refunds, using explicitly synthetic ledger fixtures.
- Read-only confirmation of a real public TON Testnet v2 refund hash, then exact hash/status storage through Redis CAS. This does not credit a production payment.
- Disconnection before a write: rejection and unchanged balances.
- Lost replies after actual Lua commits: retry by the same job ID recovers one reservation; it never debits twice. An uncertain financial operation must preserve its ID and reconcile stored state, not create a new operation.

The local Redis test requires Linux `redis-server` and `redis-cli` (installed by CI). It listens only on an owner-restricted Unix socket, enables AOF with `appendfsync always`, acknowledges ledger/queue writes, kills its own process, restarts from the same directory and verifies balances, captured-job journal, grant state and queue contents. This verifies process-crash recovery, not recovery from storage-device loss. No container, public Redis port or paid service is required.

The deployed platform uses stateless Redis REST requests: recovery means a later request succeeds against the same persisted state, rather than reconnecting a TCP connection pool. Outages continue to fail closed; no local balance cache is substituted.

