# Batch escrow: testnet interface and cost evidence

Status: testnet rehearsal only. Open /escrow (English) or /ru/escrow (Russian).
Existing owner-signed mainnet payments and paid platform balances are unchanged.
This interface does not execute AI jobs, spend platform balances, or prove useful computation.

## Recommended settlement unit

Reserve a small batch before work, accept the whole completed batch once, and let
each beneficiary withdraw with their own signature. Split: executor 85%, protocol
10%, reserve the exact remaining 5%. There is no additional GSTD claim commission.
The signer pays TON execution budgets. Unused native TON can return to the caller;
the payer can reclaim coordinator/share surplus. Four contracts retain 0.02 TON
each. Canonical token wallets retain separate storage balances.

Batching amortizes deployment, decision and withdrawal overhead across work.
One escrow per tiny AI request is too expensive. A long-lived payment channel
could amortize further, but adds off-chain state, disputed-close rules and recovery
complexity. The existing platform ledger has lower per-request chain overhead but
retains a platform dependency. The batch design is the smaller implementable step
towards beneficiary-controlled withdrawals, not a proof of a universal optimum.

The payer must explicitly accept the batch; this is not automatic proof that an AI
answer is correct. Use small, short-lived batches, because partial acceptance and
dispute arbitration are not implemented. Review all recipient addresses before funding.

## Reproducible measured comparison

contracts/tests/BatchEconomics.spec.ts executes the canonical GSTD wallet code with
a valueless testnet master, five independent escrows versus one escrow containing
the same total token amount. It sums transaction.totalFees.coins across all returned
transactions, including wallet execution and native-surplus recovery, excluding
test-token minting.

- Five separate lifecycles: 191947035 nanoTON (0.191947035 TON).
- One batched lifecycle: 38391541 nanoTON (0.038391541 TON).
- Ratio: 4.999722074193375, approximately 80% fewer consumed fees.

The bundled Sandbox fee configuration and testnet network ID were used.
This is a bounded comparison, not a live mainnet gas quote. Fees, refundable
attached budgets, and retained storage capital are different quantities.
For a practical batch size, choose a maximum acceptable gas/budget ratio first;
compare expected gas value against the total batch value, not a single request.
There is no fabricated GSTD/TON price or guaranteed node profit.

The proof JSON is frontend/src/lib/escrow-generated/cost-proof.json; unit tests bind
its code hashes to the generated contract manifest. Regenerate wrappers using
contracts/scripts/export-escrow-bindings.cjs after compiling the contracts.
A fresh compile/export was byte-compared against all five platform artifacts.

## Buttons and safeguards

1. Connect a separate TON testnet session; obtain free testnet TON using the faucet link.
2. Review payer, beneficiaries, amount and expiry; save the recovery draft.
3. Check chain state, mint valueless test tokens, deploy and fund missing shares.
4. Accept only when all three funding notifications are confirmed.
5. Each beneficiary signs their own withdrawal. If never accepted, expiry permits
   return only to the payer. The accepted/refunded decision is irreversible.
6. Recovery buttons repeat delivery/notifications and reclaim unused native TON.

The API prepares unsigned testnet transactions only. The page and wallet payload
bind network and signer. Contracts enforce network ID, pinned wallet code,
immutable destinations and authorization. Mainnet deployment is not activated.

A signature/BoC is not a payment receipt. Sending is blocked while an operation
awaits expected chain-state evidence. Pending snapshots are retained per contract
across restored drafts. Wallet requests use an exclusive origin-scoped Web Lock
with no queued prompts; operation IDs prevent stale confirmations from clearing
a newer pending operation. Unsupported browsers fail before signing. This does
not coordinate different devices/profiles or prove transaction finality. No transaction is retried
automatically. Partial funding, refund or native-reclaim progress does not clear
the pending operation. State-change evidence is not complete transaction-trace validation.
If a wallet action fails without a definitive rejection, or a multi-message
operation partially completes, inspect the wallet and chain before recovery.
Do not treat this test UI as a production payment-recovery system.

Chain reads occur only on button presses. The anonymous test endpoint has a shared
three-status-checks/minute limit and paces free-indexer calls. Another visitor can
consume that limit; wait a minute. Failed TonAPI reads select a fixed TON Center
testnet fallback for that status check, with no redirects or broadcast. Frozen
accounts and failed getters on active accounts are never reported as empty.
No continuous polling or paid RPC is enabled.

## Still required before autonomous mainnet settlement

- A real testnet wallet journey including partial multi-message execution, rejected
  signatures, delayed indexing and restoration after browser/device failure.
- Transaction-trace-based reconciliation for uncertain outcomes.
- Connect funded batch IDs and explicit acceptance to actual jobs, without crediting
  the same work to both the existing ledger and the new escrow.
- Select verified protocol/reserve recipients, migrate no existing custody balance
  implicitly, and measure current mainnet fees before any deployment.
- Real GSTD deposit/work/withdrawal verification after the owner supplies test funds.

No mainnet contract was deployed and no user transaction was signed in this work.

## Owner setup: a free dedicated testnet RPC key

Anonymous providers may return429 to shared Cloudflare egress IPs even when this
application sends few requests. A dedicated free TON Center key is recommended.
In Cloudflare Workers & Pages, open gstd-ai-platform → Settings → Variables and
Secrets → Add → Secret, set ESCROW_TESTNET_TONCENTER_API_KEY to your testnet key,
and deploy that secret change. The optional preview Worker is named
 gstd-ai-platform-preview; add its own key there if testing the preview endpoint.
Do not put the value in GitHub code, chat, NEXT_PUBLIC variables, or a URL.

Alternatively set ESCROW_TESTNET_TONAPI_KEY for TonAPI. Only the corresponding
fixed testnet host receives that credential: X-API-Key for TON Center,
Authorization: Bearer for TonAPI. Redirects are manual and never followed.
A sole TON Center key bypasses the anonymous TonAPI attempt. Existing global
check limits and pacing are unchanged; adding a key never enables automatic polling.
No payment, wallet signing key, or mainnet permission is required by this setting.


## Connection isolation

The test page requests network-3 through TonConnect SDK before wallet selection.
The main platform provider, wallet listener and automatic claim worker are not
mounted in the testnet document. Links across this boundary use full document
navigation: ui-react shares one module-level instance, so nesting providers is
not connection isolation. A connector-identity guard fails closed on an unexpected
SPA entry and offers a full-document reload. The new wallet-connection prefix does
not remove existing escrow drafts/pending records or platform wallet storage.

### Wallet request compatibility

SDK 3.4 requires user-friendly message destination addresses. The escrow transaction
builder encodes every destination as a non-bounceable, test-only friendly address;
raw addresses remain the canonical identity for previews, signers and deterministic
contract derivation. No contract address, payload, recipient or amount changes.
`escrowWalletRequest.test.ts` sends all ten action shapes to the actual installed SDK
while disconnected: each must reach WalletNotConnectedError, proving local payload
validation passed without sending a request. The old raw destination is tested to
fail before transport. Only that SDK local-validation error (or explicit rejection)
clears its own operation record; unknown failures remain blocked.

For a legacy blocked test-token mint, the UI can archive the old draft and create a
new test batch only while the observed coordinator is undeployed and no shares are
funded. The original pending record is never removed or replayed, and the archive
contains the original input, plan and pending snapshot. This is not transaction
cancellation or a recovery path for deposits, withdrawals or other financial actions.
Reject any old mint prompt that later appears in the wallet.

### Live rehearsal on 2026-11-03 (partial, not a release sign-off)

- The owner connected the funded testnet account and signed the mint and deployment.
- `get_wallet_data` confirmed 1000000000000 nano-tGSTD (1000 tGSTD).
- Coordinator `0:ab9c3fc671aead2823fd1a87c1e29a0703c276f20c0323373b1a98164d8caec1`
  is active; its observed code hash exactly matches the exported
  `4ea8dbe18b3bf18207703e8c64fef6fc9b1e2ead8a533f9cd5aab84e08a72717`.
- Funding on mobile Gram Wallet opened and disappeared. The application received
  an uncertain error. The subsequent wallet history contained mint/deploy and
  their returns, with no outgoing funding transfer; all share balances remained
  zero in the checked snapshot. No retry was issued. This is not proof of a
  permanently failed transaction or permission to clear the operation.
- At this initial checkpoint, acceptance, beneficiary claims, timeout/refund,
  receipts and paid AI-job binding had not been verified. See the later V2 outcome
  below; mainnet remains blocked.

Wallet diagnostics now persist fixed public error categories, the transport's
request-dispatched callback, request expiry and signature-returned state alongside
the same pending operation ID. A dispatched callback is not proof of wallet UI
display or signing. Its absence is not proof that nothing arrived. Legacy records
remain blocked and explicitly report that their old delivery stage is unknown.
Exported recovery files include these non-secret diagnostics. Error recognition
uses the stable SDK validation prefix rather than a minified constructor name.

### Explicit metadata-bearing test asset V2

New drafts set `testAssetVersion: 2` and use `TestGstdMasterV2`. Its immutable
on-chain TEP-64 content contains `GSTD Test Token`, `tGSTD`, decimals `9` and a
valueless-testnet description. No metadata HTTP service is required. The original
master returned an empty content cell, which the My Wallet/Gram engine metadata
loader rejects. This is a verified compatibility gap, not proof that it was the
only cause of the disappearing mobile funding request.

Missing/explicit version 1 always keeps the original master and task derivation.
Legacy exported bindings and hashes are byte-identical. V2 is a separate test
asset and does not convert existing V1 balances. A new test needs a new mint and
new signatures. The UI can archive an empty legacy coordinator and prepare V2
only when state/mask and all three observed balances are zero. Any pending
operation must be at least ten minutes old; it remains preserved, not cancelled
or retried. This is a local rehearsal convenience, not transaction reconciliation
or authority to enable mainnet. Save the original recovery file first.

The UI provides a testnet-friendly master-address copy button and manual wallet
token-import guidance. The funding endpoint and button require enough verified
payer token balance to cover all missing shares. No wallet request is prepared
when the verified balance is insufficient.

The existing published fee comparison uses the legacy test asset. V2 cost measurement is separate. The mobile happy-path outcome is recorded below.

### Completed V2 happy-path rehearsal (UTC 2026-11-03)

The owner signed each operation in mobile Gram Wallet. Manual token-list import
was not performed. Direct testnet getters and scoped transaction history confirmed:

- Mint of 1000 tGSTD V2 with the intended on-chain name, symbol and 9 decimals.
- Coordinator and all three share code hashes match the exported bindings.
- Funding of a 1-token package: exactly 0.85 / 0.10 / 0.05 tGSTD.
- Acceptance and three separate beneficiary-signed withdrawals.
- Every share token balance becomes zero; repeated withdrawal buttons disable.
- Final owner token balance returns to 1000 tGSTD. All roles deliberately use the
  same owner in this rehearsal; this is not live multi-party permission testing.
- Reclaim of unused native coins from the four escrow contracts, preserving
  exactly 0.02 TON per contract (0.08 total). Canonical token-wallet storage is
  separate. Attached execution budgets are not measured consumed fees.

Eight owner-signed transactions cover mint, deploy, funding, acceptance, three
withdrawals and native reclaim. Detailed address/transaction evidence is retained
in the owner's local verification report, not required in public documentation.

### Live-mainnet-configuration simulation (not a broadcast)

The current mainnet configuration was fetched read-only with TON Center
`getConfigAll`, global ID -239, config hash
`bb18654caf0886bff5c7c5241d2c33d659392fcbee6e51ed93c98e275165c480`.
The canonical mainnet token's reported wallet code was independently rechecked
and matches pinned hash
`a46ef8746f4ea669c2ce9455be129b693cd1c638cb021faaac58c7df01e0a163`.
All eight existing escrow scenarios passed again with this config and a shifted
test epoch preserving their relative timing. Their balances remain synthetic.
This checks acceptance, withdrawal, expiry/refund, partial funding, forged
messages, decision delivery recovery and gas failure under the observed config;
it is neither a full chain fork nor an actual mainnet transaction.

Outstanding release gates remain: live expiry/refund and uncertain-transaction
reconciliation, an independent beneficiary-wallet rehearsal, job/receipt binding
with exactly one settlement mode, a reviewed mainnet deployment/recipient
manifest, and a small real GSTD mainnet cycle after deployment. Testnet success
and simulation alone do not authorize unrestricted mainnet balances or payouts.
