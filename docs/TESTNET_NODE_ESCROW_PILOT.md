# Real-node testnet escrow pilot

This is an operator-only integration rehearsal, not a mainnet enablement or a proof of arbitrary AI quality.

## Flow

1. Bind the node's separate testnet beneficiary with its existing registered Ed25519 identity and a revision-bound, testnet-domain signature. The primary node payout is untouched.
2. On /ru/escrow or /escrow, prepare one qwen2.5:0.5b arithmetic task at the catalog price of 0.005 valueless tGSTD. The exact node, model, recipients, budget, deadline and random nonce are committed into the contract task ID.
3. Deploy and fully fund the three on-chain shares.
4. Sign an exact one-time TON Connect text authorization. The server verifies the wallet StateInit, known wallet code, derived key, app domain, timestamp and task-bound challenge. No supplied public key is trusted.
5. After a fresh full-funding check, atomically persist the queued state and enqueue once to the selected node. The unchanged node performs local inference and authenticates its completion request with its registered identity. The current peer authentication signs node ID and timestamp, not the result body; the stored receipt is a platform observation, not a portable cryptographic proof of inference.
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

Active smart-contract destinations use bounceable friendly addresses; deployment messages with StateInit use non-bounceable addresses. Authorization follows the official TON Connect text-signature construction: https://github.com/ton-blockchain/ton-connect/blob/main/spec/rpc.md#signature--text-and-binary .

## Observed expiry/refund rehearsal (4 November 2026)

An operator funded all three shares of the first node pilot, then resumed after its deadline and after the one-hour job record had expired. Computation and acceptance remained blocked. The payer signed expiry, refund of all three shares, and native-TON reclamation. On-chain verification found phase 2, three empty phase-2 shares, and the original 1000 tGSTD payer balance restored. This verifies the expired-job refund path independently of the short-lived job record. It is not a completed paid computation. A fresh funded node execution subsequently returned 391 for 17 × 23 using qwen2.5:0.5b in 744 ms. The payer signed acceptance and all three withdrawals. The 0.005 tGSTD budget split into 0.00425 / 0.0005 / 0.00025; all shares became empty and the payer balance returned to 1000 tGSTD. Native reclamation left exactly 0.02 TON per escrow contract, 0.08 total. A bounded TonAPI query supplied 21 raw transactions across the coordinator and three native share contracts: their raw hashes matched, with no aborted transaction, failed VM or failed action in that scope. Owner-wallet and jetton-wallet histories are outside this trace count. No internal money-ledger credit occurred. All roles used one operator wallet, so independent-beneficiary permission testing remains open. Detailed addresses and hashes are retained in the owner’s local report, not in this public guide.
