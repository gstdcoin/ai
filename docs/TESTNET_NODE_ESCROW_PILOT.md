# Real-node testnet escrow pilot

This is an operator-only integration rehearsal, not a mainnet enablement or a proof of arbitrary AI quality.

## Flow

1. Bind the node's separate testnet beneficiary with its existing registered Ed25519 identity and a revision-bound, testnet-domain signature. The primary node payout is untouched.
2. On /ru/escrow or /escrow, prepare one qwen2.5:0.5b arithmetic task at the catalog price of 0.005 valueless tGSTD. The exact node, model, recipients, budget, deadline and random nonce are committed into the contract task ID.
3. Deploy and fully fund the three on-chain shares.
4. Sign an exact one-time TON Connect text authorization. The server verifies the wallet StateInit, known wallet code, derived key, app domain, timestamp and task-bound challenge. No supplied public key is trusted.
5. After a fresh full-funding check, atomically persist the queued state and enqueue once to the selected node. The unchanged node performs local inference and signs completion with its registered identity.
6. Verify the exact model and arithmetic result, persist an idempotent receipt, and enable acceptance. The internal money ledger is never credited by this settlement mode.
7. The payer accepts on-chain. Each beneficiary signs its own withdrawal; shares are 85/10/5. On failure, use the existing expiry/refund path.

The pilot payer must equal the node's separately signed testnet beneficiary. All three roles use that same test wallet for this rehearsal. Public faucet tokens cannot buy arbitrary third-party node compute. A node must advertise the exact installed model; no silent model fallback occurs.

## Limits

- Testnet (-3) only. Mainnet is blocked.
- Arithmetic benchmark only; a known answer is not proof of honest general inference or independent execution.
- One selected physical node is not multi-node resilience evidence.
- Queue and receipt state is bounded to one hour; the task deadline is 30 minutes. Download recovery data. After expiry use the contract refund path, not replay.
- Funding checks and result checks are explicit buttons; there is no automatic chain polling or retry of uncertain transactions.
- The contract acceptance authority remains the payer. The UI/API receipt check is not an on-chain oracle.
- A completed standalone escrow is not evidence of a completed paid node job. Record the live job and payout proof separately after verification.
- Mainnet still requires review of the actual deployment and recipients, real small-value GSTD settlement, expiry/refund and recovery checks, and independent-beneficiary testing.

## Validation

The integration tests cover altered commitments, wallet ownership/domain/time/text checks, insufficient funding, one-time enqueue, exact-node/model assignment, invalid result rejection, duplicate completion, primary payout preservation and zero internal ledger credit. Existing payment, task and wallet tests must pass before deployment.
