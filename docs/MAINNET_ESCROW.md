# Owner-signed GSTD mainnet settlement

The mainnet route is /ru/escrow-mainnet (English: /escrow-mainnet). This release is a controlled first launch, not unrestricted public activation. A real mainnet payment/payout cycle remains an owner-signed release check.

## Frozen deployment policy v1

- Network: TON mainnet, global ID -239.
- Canonical GSTD master: 0:efe9c616f673622a337737097c0fa0018d4887d6061f59519985f3fbfbdb59b2, 9 decimals.
- Protocol 10% and reserve 5%: the node payout address explicitly selected by the owner, 0:a45c594d46cb9b529ed487b960fd2714a8b0a27dfd5008bb1d414d1aee4a61a9.
- Executor 85%: selected node's separately registered payout, frozen with its revision.
- First payer allowlist: that same owner-selected node payout address. Maximum task budget: 1 GSTD. One ordinary inference request, up to 512 response tokens; deadline 30 minutes, at least five minutes remaining before execution.
- Contract and canonical jetton-wallet code hashes are pinned in src/lib/mainnetEscrowManifest.ts. The unchanged generated escrow contracts enforce config parameter 19 and the canonical mainnet master during initialization.
- Append a new manifest version for future policy changes. Never rewrite v1's recipients or derivation and strand saved recovery files.

The platform backing wallet and existing platform balances are separate. This release does not migrate custody balances, move reward-contract tokens or mint GSTD.

## Owner setup

Store a mainnet TON Center key as the Cloudflare Worker secret ESCROW_MAINNET_TONCENTER_API_KEY on gstd-ai-platform, then deploy. Keep the separate testnet secret. Never put keys in a repository, page, query string, recovery file or chat.

The authenticated preflight verifies the canonical jetton wallet code and compares local token-wallet derivation with the master's own get_wallet_address getter. It reads the owner-selected node wallet's actual GSTD and TON balances. A configured key alone is not proof of a healthy provider or sufficient funds.

Before chain reads or preparation, a wallet proves ownership with a one-hour, network/domain-bound text-signature session. The session cannot sign transfers. Anonymous callers cannot consume the shared mainnet RPC quota. The existing registered bootstrap-node identity may also run read-only preflight diagnostics; it cannot authorize financial operations. A beneficiary becomes eligible for wallet verification only after the verified operator selects that payout in a quote.

The wallet must support TON Connect text signing and a recognized wallet StateInit. Seed phrases and financial private keys never enter the platform or node. Mainnet and testnet use separate wallet manifests, connection stores, recovery stores, pending-operation keys and browser locks.

## Paid inference

1. Choose an exact installed model on an online node, enter a request and explicitly consent to send it to that node.
2. Prepare a fixed quote. The task commitment binds manifest/network/master, payer, three recipients, budget, deadline, exact node/model, prompt hash, response-token limit, payout revision and random nonce.
3. Save private recovery. Check mainnet state and funds. Deployment is not prepared if the verified GSTD balance cannot cover the quote.
4. Sign deployment and reservation in the payer wallet. All three actual shares must be fully funded.
5. Sign the exact one-time mainnet computation permission. The server checks wallet StateInit/key, address, domain, time and challenge, then rechecks actual full funding before an atomic one-time enqueue.
6. The selected authenticated node receives the prompt and reports its exact model and answer. The payer reviews the answer and signs acceptance.
7. Each beneficiary signs its own on-chain withdrawal. No extra GSTD claim fee and no duplicated internal money-ledger credit.

On expiry the payer can authorize and claim refunds. Accepted decisions cannot be reversed. The contract does not judge AI quality or arbitrate disagreements; manual acceptance requires trust between the parties. The first-payer restriction keeps this release within the operator's controlled trial.

## Privacy and recovery

Private prompt and result records expire after an hour following their last state change. Redis queue entries contain only the task commitment; plaintext is attached only to the authenticated selected-node response while the private record remains valid. The old public task-result API rejects mainnet task IDs.

Private access tokens are random, stored hashed on the server and never confer wallet spending authority. Their holders can read the private answer; keep private recovery files private. A separate beneficiary-details export omits the prompt, answer, access token and execution metadata. Financial contract recovery derives the same addresses without that private metadata or an unexpired job record.

The platform observes authenticated completion. Current node authentication signs node ID and timestamp, not a portable signature over the result body. Do not describe the receipt as cryptographic proof of arbitrary AI quality or of honest model execution.

## Free infrastructure and uncertain operations

There is no automatic chain polling. Mainnet chain journeys are globally limited to two per minute and serialized by a short-lived lease. Each journey has a bounded time budget. Per-provider requests are paced; verified master/code and wallet derivation checks are cached for five minutes.

Financial pending records are persisted before opening the wallet. An uncertain result remains blocked across reloads. A signature alone is not a payment receipt; partial funding never clears the full-funding operation. These browser locks do not coordinate other devices or direct blockchain clients. General cross-device and ambiguous-transaction reconciliation still requires separate live evidence before public activation.

Attached TON execution budgets are not measured consumed fees. Reclaimable change and escrow/jetton-wallet storage are separate from consumed gas. The controlled real cycle must verify actual balances, bytecode/data, transaction outcomes and receipts before broad release.
