# GSTD withdrawals and data controls

The production payment path uses the existing canonical GSTD Jetton and an owner-controlled custody wallet. It does not call the unverified legacy Settlement/Escrow contracts or create another token.

## Wallet cycle
A verified GSTD deposit becomes fully reserved internal credit. A funded accepted job distributes 85% to its executor, 10% to protocol operations and 5% to the reserve. The executor can claim earned credit, spend it on another node, or request a mainnet withdrawal. Promo requests cannot fund monetary rewards.

## Withdrawals
Open /payments and connect the wallet through verified TonConnect login. Claims and withdrawal requests charge zero GSTD fee. A request reserves only the authenticated wallet's own available credits; at most one active request per wallet is allowed.

The custody owner signs each transfer in TonConnect. No treasury mnemonic is stored in a Worker or compute node. This is an owner-signed pilot, not an autonomous or trustless withdrawal contract. An unavailable owner can delay withdrawals.

The operator sees recipient, amount and up to 0.05 TON attached execution budget before signing; unused native TON is returned by the wallet contract. Native execution costs are paid by the custody owner, not deducted as another GSTD commission.

The server commits dispatch state before presenting a transaction for signature. It never retries sending automatically. A sender seqno or a returned BOC alone is not settlement: the recipient's real successful TEP-74 internal transfer must match the canonical master-derived wallets, exact amount, recipient, sender, unique query ID and dispatch time. A receipt can close only one withdrawal. Confirmation reduces the reserved liability exactly once.

Normal unsigned requests can be cancelled and refunded. An uncertain dispatch cannot be cancelled by a timer or a client claim. If the signing window expired, a public chain head more than two minutes beyond expiry and an unchanged custody wallet seqno can prove that this window was not used, permitting recovery of an unsigned/unbroadcast request. Other uncertain states remain reserved for chain reconciliation; they must never be manually cleared just to retry.

Both the user and operator can ask the API to search recent recipient transactions or supply the receiver transaction hash. One bounded background monitor also checks the single in-flight payout; an unsuccessful bounded search is not proof of failure. A recipient hash remains an independent recovery path.

Deposits and fresh allocations pause while a payout is in flight, preventing overlapping allocation of custody assets. Existing internal movements retain their liabilities. The custody balance and obligations are periodically reconciled; missing/stale backing fails closed.

## Privacy
Direct node requests are local-only by default. Explicit privacy: network allows forwarding after local failure. The node does not automatically publish prompts/answers to collective memory, and ordinary requests do not enable cross-request caching.

A paid response is retained separately for ten minutes to recover a dropped response. The permanent financial record stores only its digest and monetary metadata. The session owner can delete the transient response at DELETE /api/v1/finance/responses?id=payment_id, or use the chat's Delete server copy control. Deletion does not erase public blockchain receipts or monetary audit records.

Telegram conversation context expires after one hour and /new clears it sooner. Corporate Cloudflare AI fallback requires the user's /cloud on consent; /cloud off withdraws consent. The website demo also requires an unchecked-by-default consent checkbox. Hosting and Telegram are still corporate dependencies.

## Deployment acceptance
Unit tests cover reservation/cancellation, unauthorized dispatch, duplicate sending gates, amount/query mismatch, exact confirmation, expiry/nonce recovery and TEP-74 message encoding. Existing raw mainnet receipt fixtures verify parsing. The production Lua path is tested on disposable Redis, never a production database.

A real positive mainnet withdrawal still requires an actual funded credit and the custody owner's wallet signature. Test results do not constitute an external security audit or evidence of a completed live payout.
