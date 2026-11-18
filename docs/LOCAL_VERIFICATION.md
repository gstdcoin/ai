# Local GSTD verification

Use Node.js 22, Python 3.11 or 3.12, and a local Ollama instance. Keep the checkouts under the same parent directory. Use throwaway application state, a public test payout address, and separate test wallets for any testnet signing.

## Tests

- Platform, from `ai/frontend`: run `npm ci`, `npx tsc --noEmit`, and `npm test`. On Linux with `redis-server` and `redis-cli`, run `node tests/moneyRedis.test.cjs`. It starts its own Redis with a private Unix socket and disposes of the database on exit. The regular test command uses development storage for most tests.
- Node, from `gstdbot`: run `npm ci`, `npx tsc --noEmit`, and `npm test`. Verify that an occupied compute slot prevents a task poll, a transient Ollama failure retries the exact model, and failed or incomplete output never submits a successful completion.
- TON, from `contracts`: run `npm ci --ignore-scripts`, `npm run build`, and `npm test`. The tests use TON Sandbox. Repeat funding, acceptance, beneficiary claims and expiry/refund on testnet with independent wallets before promoting a contract. Require final recipient-side receipts and record actual gas.
- SDK, from `A2A`: run `python -m pip install -e ".[dev,mcp]"`, `python -m pytest tests`, and `npm test`. The JavaScript tests use an HTTP server on loopback. The Python worker uses `GSTD_WALLET_ADDRESS` and a separate Ed25519 node identity.
- Public website, from `web`: run `npm ci`, `npm test`, and `npm run build`.
- Bridge research, from `gstd-bridge`: run `cargo test --locked` with Rust installed. The repository has no production withdrawal implementation. Keep its validator and vault configuration outside the compute and escrow release.

## Run the compute path

1. Start Ollama on loopback and install a model, for example `ollama pull qwen2.5:0.5b`. Confirm that `curl http://127.0.0.1:11434/api/tags` lists the installed model.
2. In `ai/frontend`, run `npm run dev`. Open `http://127.0.0.1:3000/dashboard` and select **Check platform health**. The development server can use in-memory storage for a basic smoke test. For persistent testing, use a separate Redis REST endpoint and set `KV_REST_API_URL` and `KV_REST_API_TOKEN`; the application uses the Upstash REST protocol.
3. In `gstdbot`, set `GSTD_SWARM_URL=http://127.0.0.1:3000`, `OLLAMA_URL=http://127.0.0.1:11434`, and `GSTD_DEFAULT_MODEL=qwen2.5:0.5b`. Run `npm run build` and `npm start`. Open the node dashboard at the URL printed by the daemon, finish local operator setup, and supply a public payout address. Check the platform's live node list and the node's operator endpoint for a signed heartbeat, detected model and measured resources.
4. Submit an inference request with the exact model ID and check the result. Pause and restart Ollama during an assigned request. The worker should finish with one accepted result or report a failure for an assigned task. An uncertain completion submission should never be reported as failed inference.
5. Check `/health` on the node and `/api/v1/health` on the platform. Test Redis and Ollama independently. Redis unavailability should yield HTTP 503 from the platform health endpoint. A stopped Ollama should be visible in the node's next runtime health sample.

The live ledger requires reconciled backing. Use the disposable Redis suite to check reserve, capture and refund without spending GSTD. Keep platform ledger payouts, TON escrow payouts and the research bridge independent when verifying a release.

For Cloudflare release checks, CI uses independent `PREVIEW_KV_REST_API_URL` and `PREVIEW_KV_REST_API_TOKEN` repository secrets when both are configured. Otherwise it provisions a fresh empty temporary Upstash database through the official free API. Partial configuration and production origin/token reuse still block deployment. The preview requires a random CI capability, expires access after 30 minutes, has no cron/production route and protects static assets before dispatch. See [preview isolation and recovery checks](PREVIEW_REDIS.md). Production keeps its existing database bindings.

## Verification with a zero cash budget

The standard Linux GitHub Actions runner is free for public repositories. The platform CI already installs Redis and runs `node tests/moneyRedis.test.cjs` against a disposable database. This covers real Lua and Redis behavior without allocating production backing.

For the actual Upstash REST client on Windows or Linux, run `node tests/moneyRest.test.cjs --create-free-database` from `frontend`. The explicit flag provisions a new temporary Upstash database, checks that it is empty, and runs only synthetic accounting. Credentials remain in process memory. The service automatically expires the database after 72 hours. This test database is separate from deployment preview; every deployment can provision its own fresh database. A permanent staging database remains optional.

An execution on 2026-11-18 verified the real Upstash REST path with production memory fallback disabled. Eight concurrent failure reports produced one increment. Eight concurrent reservation requests acquired one reservation. Capture credited exactly 85/10/5, identical capture retried safely, a changed result was rejected, and cancellation returned the synthetic payer's remaining reservation. This establishes application and datastore behavior with artificial balances.

The extended release matrix also verified one `SET NX PX` lease winner among 16 callers, owner-checked release and expiry, a real TON Testnet hash/status round-trip, disconnection before writes and lost responses after real Lua commits. Retrying the original operation ID recovered the existing reservation without another debit. Linux CI verified that AOF with `appendfsync always` preserves acknowledged balances, captured-job journal, grant state and queue contents across SIGKILL/restart. These checks use disposable databases and do not establish production backing.

Escrow v2 was compiled and tested in TON Sandbox with four different payer/executor/protocol/reserve addresses. The three scenarios cover beneficiary caps and excess return, expiry refund, and complete 85/10/5 delivery. The emulator recorded transaction-tree total fees of 6,086,472 nanoTON for acceptance, 3,506,486 per claim, 6,076,608 for expiry, and 3,334,966 for the tested refund. These values describe this local configuration and workload. They are estimates for selecting attached TON budgets, and mainnet fees require later reconciliation.

The subsequent public Testnet v2 run confirmed 0.85/0.10/0.05 tGSTD payouts and a 0.425 tGSTD expiry refund through four separate Wallet V5 accounts under one operator. Its 13 signed requests generated 80 account transactions with 0.071969367 Testnet TON in summed trace fees. Code hashes matched all 17 involved active accounts. Four one-nanoton wallet notifications skipped compute, while token credits and canonical acknowledgements completed. See the [public Testnet evidence](https://github.com/gstdcoin/contracts/blob/master/docs/ESCROW_V2_TESTNET.md); this is separate from mainnet or full platform job-settlement verification.

CPU execution can verify a small Ollama model, exact-model routing and worker failure behavior. GPU hardware performance and capacity remain a separate evidence item. A first public compute release can expose only measured CPU capacity. Bridge withdrawals remain outside that release because their implementation is incomplete.

On 2026-11-18 a separately started local Ollama 0.34.0 instance ran `qwen2.5:0.5b` on CPU with `num_gpu=0`, 1,024 context tokens and 24 maximum output tokens. It completed both checks: exact `READY` and `5` for 2 + 3. Client-observed elapsed times including model loading were 2,037 ms and 2,007 ms. The process used a loopback listener and stopped after the checks. These two samples establish execution on this machine; throughput, load reliability and GPU measurements need their own runs.

The Rust research bridge also completed `cargo test --locked --offline --quiet` on the local Windows toolchain, with four tests passing. This tests the implemented research paths. Its chain withdrawal methods remain unfinished.
