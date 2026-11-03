# Escrow testnet acceptance and mainnet release gates

This is a record of required evidence, not a claim that the whole ecosystem is ready.
Never mark a live-chain row passed from unit tests, wallet signatures, or an HTTP200 alone.

## What is already established

- Contract suite:56 Sandbox tests passed before this UI follow-up.
- Source-to-generated-binding parity was byte-verified after compilation.
- Valueless test master rejects mainnet; coordinator binds network/master/recipients.
- Production Worker can read testnet using its private dedicated provider key.
- Live unsigned deployment payload binds signer/network; StateInit hashes to the displayed contract.
- Mainnet request to the testnet planner is rejected.
- Browser operation tests cover concurrent attempts, stale confirmations, legacy pending
  drafts, unavailable storage/locks and release after failure. Native multi-tab
  behavior still requires the manual row below; mocks are not browser evidence.

## Live-chain journeys awaiting testnet TON and owner signatures

Use /ru/escrow or /escrow. The header's platform wallet is separate from the
page's “Connect test wallet” button. Choose TON testnet in the wallet.
Save the recovery draft before funding. Obtain free TON using the page faucet;
the test tokens have no market value and do not credit platform balances.

| Journey | Required observation | Current evidence |
| --- | --- | --- |
| Reject signing | Reject a wallet request; no matching successful chain transaction; an explicit new attempt is possible | Sandbox/UI logic; live pending |
| Mint and deploy | Payer receives test tokens; coordinator and three shares are active; network-3 and expected code/addresses | Sandbox; live pending |
| Reserve | All three actual token balances match85/10/5 and readiness mask7; acceptance before full funding is refused | Sandbox; live pending |
| Accept | One accepted decision reaches all shares; expiry cannot reverse it | Sandbox; live pending |
| Withdraw | Each entitled wallet receives its exact share; only that beneficiary can authorize withdrawal; no additional token fee | Sandbox; live pending |
| Repeat withdrawal | Empty share cannot yield another payment; signature/BoC is not counted as a receipt | Sandbox; live pending |
| Expiry refund | A second, unaccepted batch expires; only payer receives remaining tokens; later acceptance fails | Sandbox; live pending |
| Partial/delayed delivery | Unconfirmed/missing callbacks cannot fabricate readiness; sync repeats only the irreversible decision | Sandbox queue-loss tests; live recovery pending |
| Native gas | Record consumed transaction fees separately from attached budgets, returned change and storage balances; payer reclaims permitted surplus | Sandbox; live pending |
| Reload/restore | Restore the same draft after reload; uncertain operation stays blocked; verify actual chain state before another send | Logic tests; live pending |
| Two tabs | While one wallet prompt is open, another tab cannot queue a second prompt or clear a different operation | Lock/ID logic tests; native browser pending |
| Second beneficiary wallet | Payer cannot withdraw another beneficiary's share; beneficiary can do so from its own test wallet | Sandbox; live pending |

For each successful transfer record network, coordinator/share address, public
transaction hash, actual token master, source/destination and amount, execution
success and before/after token balances. Never record seed phrases, private keys,
RPC keys or an unsigned plan as a successful payment. A bounded transaction search
finding nothing is not evidence of failure.

The default all-recipients-equal-payer setup rehearses mechanics only; it cannot
establish separation between independent users. Use a distinct beneficiary wallet
for that row. Do not advertise test-token work as paid GSTD earnings.

## Remaining implementation gates before autonomous production work

1. Resolve uncertain and partial wallet outcomes from transaction receipts/traces,
   not merely a balance change or arbitrary timeout. Browser locks coordinate only
   this origin/browser profile, not other devices or direct chain clients.
2. Bind a funded coordinator to real job IDs, payer authority and exact node wallet;
   enforce a single settlement mode. Existing platform-ledger rewards and escrow
   rewards must never both credit the same work.
3. The user must explicitly accept work. The contracts do not prove AI quality or
   provide dispute arbitration; testing payment mechanics does not remove this trust.
4. Produce a reviewed mainnet manifest with network-239, canonical GSTD master,
   compiled code hashes, verified protocol/reserve recipients and selected expiry/budget
   rules. Re-derive all addresses; testnet addresses/tokens must never be relabeled.
5. Verify current mainnet execution/storage costs and native-TON recovery. Keep existing
   platform custody balances and liabilities separate; no implicit balance migration.
6. Only after the above, deploy and verify mainnet code/data at the derived addresses,
   then activate the new UI mode in a separate controlled release. Check one small
   real GSTD cycle before broader use; testnet cannot establish real-asset backing.

Mainnet activation is therefore not just changing a network string. The existing
owner-signed production payment path is unchanged until an explicit, verified
migration/release. No mainnet contract deployment or user signature was performed
by this checklist.
