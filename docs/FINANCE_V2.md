# GSTD money rules v2

Status: implemented behind a reserve-reconciliation gate. No mainnet contract deployment or token transfer is part of this change. On-chain withdrawals remain disabled.

## Single rule

Only funded, completed, accepted work settles money. Of the gross task price, 85% accrues to the executor, 10% to protocol operations and 5% to the service reserve. The 5% share receives indivisible nanoGSTD remainders so the total is conserved. Web, API and Telegram claims apply zero additional fee. Presence and unfunded public work earn zero GSTD.

Campaign creation reserves the full budget without an upfront fee. Child tasks reserve portions of that budget atomically with queue insertion. Cancellation releases unused budget; child tasks already reserved complete or refund independently. Expired reservations are recovered by one bounded scheduled reaper every ten minutes. Normal inference errors release immediately. An interrupted Worker invocation is recovered after reservation expiry.

## Accounting

All v2 amounts are decimal nanoGSTD strings calculated with BigInt. Redis Lua compares original records and atomically commits account, job, receipt and queue/due-index changes; it never performs monetary arithmetic. No v2 financial record has a TTL. Production storage failures throw instead of falling back to memory.

Namespaces:
- money:v2:account:<raw TON address>: available, reserved, pending, service-only promo and lifetime-earned amounts.
- money:v2:job:<id>: immutable original amount/owner/fingerprint plus current reservation/capture/release state and accepted response.
- money:v2:allocation:<reference>: permanent allocation/deposit idempotency record.
- money:v2:inventory:<manifest>: reviewed inventory input and observed custody snapshot.
- money:v2:fund:protocol and money:v2:fund:reserve: exact internal fund balances.
- money:v2:due: only outstanding reservation expiries, not a scan of historical records.

Allocated liabilities include customer credits, job reservations, operator pending credits and both service funds. Moving credits does not change total allocated liabilities. New allocation is rejected unless verified custody covers allocated liabilities plus the explicitly retained legacy liability hold. This is a custody model; external movements from the custody wallet can invalidate coverage. A single monitor refreshes the actual mainnet balance every ten minutes; snapshots expire after fifteen minutes and new paid work fails closed.

The treasury owner must keep custody assets segregated and must not pledge them elsewhere. A balance snapshot cannot prove control of private keys, absence of obligations outside this ledger, or eliminate operator trust. Existing contract bonus funds are not automatically adopted as platform custody.

## Legacy migration: required before paid activation

Legacy balance:*, rewards:pending:* and campaign records are preserved. They are never silently relabelled as backed funds. EQ/UQ/base64/raw aliases are recognised for legacy display; ambiguous records still require review.

1. Inventory actual project-controlled custody, existing customer/operator obligations and previously recognised deposits. Do not infer reserve ownership from a holder list.
2. Select the custody owner address and reconcile all legacy liabilities. Use a dedicated wallet capable of the intended custody operations; do not substitute Settlement V2's bonus pool without reviewing its restrictions.
3. Preview POST /api/v1/finance/reconcile with an existing TREASURY_SECRET in X-Treasury-Secret. Never put the secret, a seed phrase or a private key in the repository.
4. Submit an explicit reviewed allocation manifest. The default is preview=true; only preview=false commits the internal ledger. No chain transfer is made.
5. Retain legacy_hold_nano for every legacy obligation not included in the reviewed allocations. Reduce this hold only as those obligations are resolved, avoiding counting the same obligation twice.
6. Inspect GET /api/v1/finance/reconcile and authenticated balance endpoints. Run a separately approved small end-to-end mainnet payment before broad paid access.

Request shape:
```json
{
  "custody_owner": "<verified project-controlled TON address>",
  "manifest": "<unique reviewed inventory reference>",
  "legacy_hold_nano": "<remaining legacy obligations in nanoGSTD>",
  "legacy_review_complete": true,
  "preview": true,
  "allocations": [
    {
      "wallet": "<verified beneficiary TON address>",
      "amount_nano": "<backed amount in nanoGSTD>",
      "reference": "<permanent unique allocation reference>"
    }
  ]
}
```

Do not invent an allocation or set the legacy hold to zero to bypass reconciliation. The designated custody owner is UQDMHbiYg0W5AebrOb1v2pNQ_GoCsi33vLSsJUKi_fKZMRR0 (provided by the project owner). There are no automatic legacy allocations. At verification the derived GSTD wallet was not indexed as deployed; no positive backing balance was confirmed.

## Payment API

- Paid POST /api/chat and /api/v1/chat/completions require a verified TON session plus Idempotency-Key (8–100 letters, digits, hyphens or underscores). A retry with the same key and identical parameters replays a captured answer without another charge. Changed parameters conflict; a failed/refunded key cannot create another paid request.
- Paid execution uses an actually registered operator with a valid payout address. One physical node is presented as one executor, not several independent validators. Empty/error/fallback or mismatched-model responses do not capture payment.
- POST /api/v1/campaigns/create and /api/v1/marketplace/request also require Idempotency-Key and the funding wallet's verified session.
- POST /api/v1/campaigns/cancel releases the unused campaign escrow.
- POST /api/v1/credits/deposit accepts tx_hash and a verified sender session, not an asserted token amount. It validates the raw successful TEP-74 internal-transfer transaction, its hash, custody destination, sender and sender Jetton wallet derived from the canonical GSTD master. The deposit reference is permanent; duplicate confirmation avoids new chain calls. Receipts preceding the reviewed v2 activation require explicit legacy reconciliation.
- Claims transfer pending operator rewards into backed internal credits at zero fee. They do not perform on-chain withdrawal.
- Welcome/referral awards are nonwithdrawable service-request units. They cannot fund campaigns or monetary rewards; the compatible API can consume them after the normal free quota.
- Legacy direct chat deductions, notification-based crediting, Stars-to-GSTD conversion and settlement senders are retired. Stars purchasing must not be advertised until verified service-credit invoicing is implemented.

The canonical token remains the existing 1 billion GSTD with minting disabled. No new token, mint, gold backing, automatic swap, bridge or guaranteed yield is introduced.

## Free infrastructure

A single scheduled finance call performs a bounded refund recovery and, after custody is configured, two read-only chain getter requests. There is no per-node reserve polling and no redundant GitHub collection in this finance cron. Redis reads are batched. Receipt verification is performed for actual confirmations, not by repeatedly scanning a fixed transaction window.

## Validation and limits

The suite covers conservation, full refund, duplicate/retry behaviour, concurrent reservations, nano precision, self-operated work, promo separation, campaign escrow and actual public TON receipt serialization. A disposable Redis test executes the production Lua path, including values above JavaScript's safe integer range, queue failures and fail-closed storage. No production Redis records or funds are used by these tests.

This release does not solve the earlier source/deployed-bytecode mismatch in Settlement V2/Escrow. Their mainnet payouts must remain disabled until the deployed code is independently tied to reviewed sources and the full Jetton receipt-based withdrawal flow is verified.

## Empty-ledger activation
The production inventory at 2026-10-26T08:16:38Z found zero balance records, zero pending reward records and zero internal legacy fund balances. The owner designated the custody address above. A deployment bootstrap may therefore initialise only zero assets/zero liabilities, after an atomic recheck that no legacy or v2 monetary balances appeared in the meantime. It creates no credits and transfers no tokens. Any nonempty or ambiguous state blocks bootstrap and requires the explicit reviewed-manifest path.

A missing undeployed Jetton wallet is conservatively valued at zero, never a positive reserve. Authenticated balance responses expose the designated deposit owner only after initialisation. Future credits require real successful deposits after activation.
