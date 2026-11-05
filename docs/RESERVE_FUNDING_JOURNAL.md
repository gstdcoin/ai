# Reserve funding journal and economic admission — implementation status

The owner selected permanent locking of received GSTD/XAUt0 LP. The contract sources and real-DEX-code sandbox LP/refund tests are in [contracts](https://github.com/gstdcoin/contracts/blob/master/docs/LIQUIDITY_RESERVE.md). No mainnet reserve vault is deployed by these modules.

## Implemented, tested backend components

`reserveFunding.ts` holds only accrued `money:v2:fund:reserve`, never a user account. An atomic CAS moves that amount into an in-flight reserve obligation without lowering total allocated liabilities. It shares `MoneySystem.payoutInFlight` with ordinary withdrawals, preventing simultaneous custody dispatch. Idempotency binds policy, owner, target, amount and request identity. Only a verified deployment policy may supply the target; never accept it from an HTTP body.

Submission records a message hash without declaring success. Confirmation requires two independently verified successful hashed transactions: the canonical GSTD wallet deposit and the reserve vault's accepted funding notification, with the same amount, sender, query and dispatch window. Merely receiving tokens in the Jetton wallet is insufficient if the vault failed to process the notification. Only confirmation reduces allocated liabilities and conservatively reconciles the remaining GSTD custody balance. Receipt hashes are consumed atomically. Customer balances do not change.

Recovery never follows a timer alone. It requires the signing window and safety margin to have expired both locally and on chain, unchanged custody-wallet seqno, and no recorded submission. Unknown or submitted operations remain locked for reconciliation. Repeating recovery cannot credit the fund twice.

`liquidityEconomics.ts` checks server-owned normalized evidence with integer arithmetic: fresh exact-payload simulation; a liquid independent market reference; pool/reference deviation; price impact; LP slippage and independently valued LP underlying assets; full attached TON budget versus batch value; reserve availability; separate recovery/storage TON. It rejects incomplete/stale evidence, target-pool self-pricing and uneconomic batches. The attached budget is a conservative bound, not a measured consumed fee. Its thresholds are operational candidate limits, not proof of profitability.

## Not integrated or activated

These modules are backend components, NOT a claim that the live mainnet pipeline is complete. They are not exposed through an enabled money-moving route. The raw receipt adapter (`reserveFundingReceipt.ts`) now parses and checks hashed vault notifications and combines them with canonical-wallet deposit verification. `reserveFundingTransaction.ts` builds the exact owner-signed Jetton payload, including a separately displayed 0.2 TON attached budget and 0.1 TON notification forward amount. These are candidate budgets, not measured net fees. A production route must additionally verify the deployed vault identity before using these components. A production keeper must obtain the actual independent reference, execute exact on-chain simulation, sign bounded quotes and maintain an outbox. It must not accept client-supplied evidence as authorization. A policy object or a passing pure-function test is not a verified oracle or receipt.

Still required: verified deployment/immutable policy and dedicated bounded oracle; production receipt-adapter integration; owner-signing UI and deployment-policy validation; keeper/outbox; independent price/simulation acquisition; integrated failure/recovery checks and testnet verification; bounded owner-signed mainnet acceptance with actual funds. Existing escrow commitments and recipients stay unchanged. Customer GSTD backing is never replaced with LP or gold.

The observed target pool is shallow, the accrued platform reserve was zero, and an independent liquid GSTD reference has not been established. Under these conditions automatic spending must remain disabled. No algorithm can manufacture capital, paid demand or guaranteed returns.
