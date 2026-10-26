# GSTD AI platform

A shared compute network: use AI, contribute a node, and spend earned GSTD on other nodes.

- [Try AI](https://app.gstdtoken.com/chat)
- [Balance, deposits and owner-signed withdrawals](https://app.gstdtoken.com/payments)
- [Money rules](docs/FINANCE_V2.md) · [Withdrawals and data controls](docs/WITHDRAWALS_AND_PRIVACY.md)
- [Compute node](https://github.com/gstdcoin/gstdbot/blob/main/docs/COMPUTE_PROFILE.md)

Only funded accepted work earns tokens. The split is 85% executor / 10% protocol / 5% reserve; claiming or requesting withdrawal adds no GSTD commission. Existing GSTD is used; no new issuance or guaranteed yield is promised.

The current production network has one physical node. The platform registry, Redis accounting, custody owner, DNS/hosting and bootstrap services remain central dependencies. Direct node-local inference can operate separately, but the deployed ecosystem is not unstoppable or trustless. The verified-task P2P core is experimental and does not replace the production payment ledger.

Public source availability and usage rights are governed by LICENSE. No external security audit is claimed.


Historical design notes are archived in docs/ARCHIVED_PLATFORM_README.md. They do not describe enabled production features.
