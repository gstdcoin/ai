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
across restored drafts and synchronized between tabs; no transaction is retried
automatically. State-change evidence is not complete transaction-trace validation.
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
