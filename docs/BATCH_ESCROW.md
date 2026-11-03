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
- Acceptance, beneficiary claims, timeout/refund, receipts and paid AI-job binding
  remain unverified in the live chain. Mainnet remains blocked.

Wallet diagnostics now persist fixed public error categories, the transport's
request-dispatched callback, request expiry and signature-returned state alongside
the same pending operation ID. A dispatched callback is not proof of wallet UI
display or signing. Its absence is not proof that nothing arrived. Legacy records
remain blocked and explicitly report that their old delivery stage is unknown.
Exported recovery files include these non-secret diagnostics. Error recognition
uses the stable SDK validation prefix rather than a minified constructor name.
