# GSTD payment controls and limits

## Current settlement path

Only funded, accepted work earns GSTD: reserve before execution, capture once, split 85% executor / 10% protocol / 5% reserve, release on failure. Free/promotional service never creates a withdrawable token balance. Claiming pending rewards charges no additional GSTD fee. Standard Jetton withdrawals are signed by the custody owner in their TON wallet; server code does not hold its seed or private key.

The platform ledger is custodial, not a new trustless escrow contract. The owner still controls custody assets. Node signatures prove identity, not model weights or answer quality. These controls do not guarantee immunity to fraud, compromised operators, or compromised signing keys.

## Withdrawal safety

A request atomically moves available funds into reserved funds. The same idempotency key cannot reserve twice. A wallet has at most one active request and a 60-second cooldown for new requests; retrying an existing request stays idempotent. The global queue is bounded.

The custody owner may reject a **requested** item with a dashboard button. All reserved tokens return to that recipient, once, with no GSTD fee. Rejection races atomically with dispatch: whichever wins determines the state. Rejection/cancellation after dispatch or submission is forbidden; use chain reconciliation. A wallet signature or submitted BoC is not evidence of delivery. Confirmation must match the real recipient Jetton-wallet transaction, GSTD master-derived wallets, sender, amount, query ID, time window and success/bounce status. Each receipt is consumed once. Ambiguous submission remains locked until safely reconciled; it must never be automatically resent or refunded.

Jetton verification also binds the account encoded inside the hashed transaction, rather than trusting an indexer account label. Read-only chain data still depends on the configured chain provider; these checks are not an independent validator or Merkle-proof implementation.

## Telegram delivery

The webhook checks Telegram HTTP status and JSON `ok:true`. AI replies are cached for one hour before sending. Retried updates reuse the answer without another inference or daily-quota charge. A separate 120-second processing lease prevents concurrent processing. For AI replies, completion is recorded only after successful processing; failures return a non-2xx response for Telegram retry. Non-AI commands, callbacks and wallet-link mutations retain start-of-processing deduplication, failing closed if storage is unavailable, so delivery retries cannot repeat an old mutation. Deduplication markers retain only update IDs for 24 hours; cached reply text remains limited to one hour. A failed typing indicator is nonfatal. Delivery failure does not trigger another inference provider.

Telegram cannot guarantee exactly-once messaging when a send acknowledgement is lost. A duplicate message is possible; monetary idempotency is enforced separately by the ledger. Delivery tests use isolated mocks and do not prove delivery to an actual user's Telegram session.

## No-cost verification, 30 October 2026

Public mainnet data reports GSTD supply 1,000,000,000, decimals 9, mintable=false. The master-provided Jetton-wallet bytecode matches the canonical wallet fixture used in local TON Sandbox tests. The historical `GSTDJetton.tact` source is not asserted to match the deployed token and must not be redeployed as a fix.

The configured custody owner has 0 TON and is uninitialised; its GSTD wallet is not indexed. No real payment can be funded from that state. Running free inference can provide immediate service, but it cannot create backed rewards. Existing Settlement-contract tokens are not silently treated as platform custody.

Local sandbox tests need no real funds. They do not replace a final mainnet deposit → funded work → withdrawal → receiving-transaction check. No real transfer, balance allocation, token mint, custody-key import or webhook-token rotation was performed for this review.

## Primary references

- https://docs.ton.org/applications/payments/jettons
- https://docs.ton.org/applications/ton-connect/get-started
- https://docs.ton.org/onboarding/explorers
- https://core.telegram.org/bots/api#making-requests
- https://core.telegram.org/bots/api#setwebhook
