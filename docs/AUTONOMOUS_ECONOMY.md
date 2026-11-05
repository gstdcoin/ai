# GSTD autonomy, protocol income and liquidity policy

Status: implemented ledger protocol credit and purchase entry; liquidity execution is NOT deployed.
Owner-selected target: https://app.ston.fi/pools/EQA--JXG8VSyBJmLMqb2J2t4Pya0TS9SXHh7vHh8Iez25sLp

## Economic flow

Only funded, completed, accepted work generates revenue:
- 85%: the executor payout beneficiary fixed for that job.
- 10%: protocol beneficiary 0:a45c594d46cb9b529ed487b960fd2714a8b0a27dfd5008bb1d414d1aee4a61a9.
- 5%: protected liquidity allocation, separate from the administrator's income and all customer balances.
No extra GSTD reward-claim fee. Network gas is a separate cost. Presence, registration, generated bot traffic and free trials do not mint rewards.

For new platform-ledger settlements, capture atomically credits 10% to the beneficiary's available backed platform account. Historical protocol allocations are moved to the same account once, with an idempotent journal, either on the next capture or through the verified beneficiary's Payments button. The old protocol fund is not counted a second time. Total credited income is cumulative, not the beneficiary's current wallet balance or proof of a blockchain payout.

Withdrawals remain the existing custody-owner-signed process. This change does not give the platform an online wallet private key. Existing per-job escrow contracts, commitments, recipients, recovery data and code hashes are unchanged. Their claims still require beneficiary signatures. Future autonomous contracts need a new explicit version, not edits to immutable v1 commitments.

## Verified target identities

- GSTD master: 0:efe9c616f673622a337737097c0fa0018d4887d6061f59519985f3fbfbdb59b2, 9 decimals.
- XAUt0 master on TON: EQA1R_LuQCLHlMgOo1S4G7Y7W1cd0FrAkbA10Zq7rddKxi9k, 6 decimals.
- Target pool: EQA--JXG8VSyBJmLMqb2J2t4Pya0TS9SXHh7vHh8Iez25sLp.
- Router: EQAiv3IuxYA6ZGEunOgZSTuMBzbpjwRbWw09-WsE-iqKKMrK, STON.fi 2.2 ConstantProduct.
- XAUt0 deployment source: https://usdt0.gitbook.io/xaut0/technical-documentation/developer
- DEX protocol: https://docs.ston.fi/developer-section/dex/architecture
- SDK/API: https://docs.ston.fi/developer-section/dex/api/reference

XAUt0 is the cross-chain representation on TON. It adds dependencies on its issuer/bridge infrastructure; it does not make GSTD independent of all companies. Holding a GSTD/XAUt0 LP position also does not give every GSTD holder a redeemable claim to gold or a fixed gold-backed price. The LP contains both assets, changes composition with trading, and can lose value relative to holding the assets separately; its gold quantity need not increase monotonically. The owner requested liquidity provision, not a promise of a protected gold savings account.

Observed 2026-11-05: reserve0 115 micro-XAUt0 = 0.000115 XAUt0; reserve1 8368253320797 nano-GSTD = 8368.253320797 GSTD; STON.fi reported LP value about USD 0.72. These are an observation, not a permanent price or executable quote. The pool is too shallow to treat it as a reliable price oracle or route for unattended swaps.

GET /api/v1/treasury/liquidity checks exact pool, router, token addresses, raw decimal amounts and deprecation. Observations are cached for five minutes, with a refresh lock and bounded HTTP timeout. It never prepares or sends financial transactions and always reports automatic_execution_enabled:false until an executor actually exists.

## Proposed autonomous liquidity execution — not yet deployed

Use a new, dedicated reserve vault that cannot access customer money or the protocol's 10%. Do not give a generic AI agent treasury keys, unrestricted router payloads or arbitrary destination access.

1. Accumulate the 5% allocation. Do not run an on-chain swap after each inference.
2. For the platform ledger, release only this accrued allocation through a distinct durable transfer journal. A transfer to the vault reduces reserve liabilities and custody backing together only after a canonical on-chain receipt. Never count LP tokens or gold as backing for customers' GSTD balances.
3. For future escrow versions, set the reserve recipient to the deployed vault prospectively. Old jobs retain their original reserve recipient; recovering or claiming those funds requires that original beneficiary.
4. A keeper may propose a batch but cannot choose the asset pair, beneficiary or an arbitrary target. Bind the vault to approved token masters, pool/router identities and code policy. Quote infrastructure does not get withdrawal authority.
5. Prefer acquiring XAUt0 through a deeper independently priced route, then balanced liquidity provision into the target. Single-sided provision into this shallow target would implicitly swap against it and can impose large price impact.
6. Before a batch, simulate its exact amounts and compare against a separate deeper-market reference. Validate price deviation, liquidity, minimum output, minimum LP, deadline, daily amount cap, gas reserve and estimated gas as a fraction of batch value. Stop on missing/stale data. The target pool cannot price-check itself.
7. The illustrative USD 1000 liquidity-review threshold in the observer is an operational guard, not a spending authorization or guarantee. A real deployment must set explicit amount and loss limits and test its oracle/keeper trust assumptions.
8. Keep durable states: proposed → funded → submitted → chain reconciliation → LP received / refunded / manual recovery. Record query_id, transaction/message hashes and expected LP beneficiary before dispatch. Never regenerate a transaction after an unknown outcome until reconciliation resolves it.
9. Recognize liquidity only from validated LP-token receipts belonging to the bound LP master and vault. A DEX API response, successful broadcast or transferred GSTD is not proof of liquidity provision.
10. Account separately for accumulated reserve, in-flight GSTD/XAUt0, LP holdings, refunds and TON gas. Preserve the failed-operation recovery path. Pause liquidity when unsafe without blocking paid inference and operator rewards.
11. A permissionless keeper still needs a funded gas budget and bounded anti-spam rules. A system with no funds cannot bootstrap real liquidity or pay network gas.
12. Test the actual STON.fi 2.2 messages against matching contract code/fork or a verified test deployment, including min-LP failure, partial funding, bounce, delayed/refunded messages, replay and receipt spoofing. Existing TreasuryGold.tact targets a different TON→gold flow and must not be activated as a GSTD→LP executor.

A signed quote-oracle is a trust dependency; a trusted service should not be described as cryptographically permissionless. Fully owner-independent reserve execution requires enforceable on-chain constraints and a verified oracle/price-validation design. This document is an implementation specification, not evidence those contracts are deployed.

## Simple entry

/buy (Russian: /ru/buy) offers:
1. Obtain network coins or USDT on TON using purchase options in a supported wallet. Card availability, fees and identity checks depend on country/provider. There is no claim of direct GSTD card support.
2. Open STON.fi with explicit canonical GSTD and either TON or the official TON USDT master selected. The DEX shows the actual quote and asks for the owner's signature.
3. Use either platform deposits + agent allowances, or the separate contract escrow flow. A swap fills a personal wallet; it does not silently fund platform credits.

Free trials remain bounded, separately funded service quotas and never create withdrawable rewards. Agents use owner-signed spending allowances, not personal wallet seeds. Expiry, exact-model and executor limits survive connector restarts.

## Remaining independence gates

- Real funded mainnet payment, operator payout and protocol receipt.
- Reserve vault implementation and contract-level DEX integration validation.
- Successful LP provision, refund and recovery with verified receipts.
- Funded gas and bootstrap capital; healthy pricing and liquidity.
- Multiple independent physical compute operators and a practical recovery drill.
- Discovery/queue/hosting redundancy; currently the platform, Redis, DNS and hosting remain central dependencies.
- Demand: useful workloads, measured quality and repeat users. Software cannot guarantee adoption or manufacture legitimate paid demand.

## Revenue-scale check before claiming self-sustainability

At the observed GSTD market price USD 0.000029708124375123594 and the current small-model price 0.005 GSTD/request:
- payment: approximately USD 0.00000014854;
- executor 85%: approximately USD 0.00000012626;
- protocol 10%: approximately USD 0.00000001485;
- reserve 5%: approximately USD 0.000000007427.

At unchanged price and tariff, about 134.6 million such paid requests would accrue USD 1 to the reserve, before conversion/gas costs. This does not prove economic viability, and token appreciation must not be assumed. Free/accepted request counts cannot substitute for revenue.

Before claiming profitable operators or self-funding liquidity, measure actual compute cost, set an explicit pricing policy with the owner, show fresh GSTD quotes and protect existing agreed prices and agent caps. A future cost-based price policy should quote in GSTD, reject stale/unsafe market inputs and preserve already committed job amounts. Do not silently raise tariffs or expand existing spending allowances.
