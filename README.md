# GSTD AI platform

A shared compute network: use AI, contribute a node, and spend earned GSTD on other nodes.

- [Try AI](https://app.gstdtoken.com/chat)
- [Balance, deposits and owner-signed withdrawals](https://app.gstdtoken.com/payments)
- [Money rules](docs/FINANCE_V2.md) · [Withdrawals and data controls](docs/WITHDRAWALS_AND_PRIVACY.md)
- [Compute node](https://github.com/gstdcoin/gstdbot/blob/main/docs/COMPUTE_PROFILE.md)
- [Website/app roles and node work delivery](docs/ECOSYSTEM.md)

Only funded accepted work earns tokens. The split is 85% executor / 10% protocol / 5% reserve; claiming or requesting withdrawal adds no GSTD commission. Existing GSTD is used; no new issuance or guaranteed yield is promised.

The current production network has one physical node. The platform registry, Redis accounting, custody owner, DNS/hosting and bootstrap services remain central dependencies. Direct node-local inference can operate separately, but the deployed ecosystem is not unstoppable or trustless. The verified-task P2P core is experimental and does not replace the production payment ledger.

## License and commercial integration

[LICENSE](LICENSE) keeps PolyForm Noncommercial 1.0.0 and adds permission for individuals and companies to run nodes, earn accepted-work GSTD and build commercial applications or API/SDK integrations using the GSTD network without separate approval. Under this additional permission, paid network-compute charges settle in canonical GSTD; independent application fees may use other currencies. Installation, free requests and local execution have no added token-payment requirement. TON may cover blockchain gas.

The core is source-available, not OSI open source. Base noncommercial rights, earlier releases and third-party licenses are preserved. [Practical licensing guide and third-party scope](docs/LICENSING.md). `frontend/LICENSE` is an identical copy for the frontend package. No external security audit is claimed.


Historical design notes are archived in docs/ARCHIVED_PLATFORM_README.md. They do not describe enabled production features.
