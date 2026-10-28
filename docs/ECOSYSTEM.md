# GSTD: one ecosystem, clear entry points

Start with utility: ask AI, connect a node, or build with the API. Telegram is another interface to the platform. The website and application have different roles; they do not maintain separate balances or registries.

## Canonical entry points

| Need | Entry | Responsibility |
|---|---|---|
| Learn what GSTD does | https://gstdtoken.com | Explanation, requirements and project information |
| Use network AI | https://app.gstdtoken.com/chat | Main application chat and explicit model selection |
| Try the separate free demonstration | https://gstdtoken.com/ai | Demo preserved at its existing URL; Cloudflare fallback requires explicit consent |
| See live nodes | https://app.gstdtoken.com/nodes | Canonical registry and operator status |
| Balance, rewards and withdrawals | https://app.gstdtoken.com/payments | One payment ledger; connect the personal payout wallet configured on the node |
| Install a node | https://gstdtoken.com/nodes | Supported hardware and the canonical installer from gstdcoin/gstdbot |
| Build an application | https://gstdtoken.com/developers | API documentation and repository links |
| Use Telegram | https://t.me/gstdaibot | Platform webhook and conversation interface |

RU/EN links preserve the selected language. Moving from the website demo to the application does not automatically transfer its private conversation. A wallet is not needed for free AI use.

## Two delivery methods, one accounting rule

A registered node owns a persistent Ed25519 identity and an external payout address. Signed registration and heartbeats publish capabilities to the canonical platform registry. Registration and an online badge are not earnings.

- **Direct inference:** application chat chooses an available registered executor with a reachable public inference URL. A paid request reserves backed GSTD before computation and captures it only after an accepted response. A private node without such a URL is not automatically reachable by this method.
- **Assigned background work:** a funded campaign can create an assigned task. The signed worker polls outward, computes locally, and submits its signed result. This path does not require an incoming public node URL. Only accepted funded tasks can create rewards; an empty queue means no assignment is available.

Both paid methods use 85% executor / 10% protocol / 5% reserve. Free local requests, the demo, promotional use and unfunded tasks do not create withdrawable GSTD. Earned credits can be used for paid network requests or an owner-signed withdrawal. A real backed mainnet deposit-to-withdrawal cycle remains an explicit acceptance gate, not an achievement inferred from unit tests.

## Keep the node small

Use the PIN-protected operator panel to check registration, installed models, payout address, load and update status. Hardware compatibility is an estimate, not a promise that any model runs on any device. Linux clusters currently run independent nodes; one model is not automatically pooled across machines.

Local node inference defaults to local processing. Sending a query to the platform or another operator necessarily reveals its plaintext to that executor. Corporate fallback must be explicit. Do not hardcode temporary tunnel URLs or put private signing keys in a browser, node configuration or public repository.

Keep the existing [free-tier request budget](FREE_TIER_REQUEST_BUDGET.md). The website, application and node reuse the canonical registry and payment ledger. Do not add parallel billing, fabricated metrics or presence rewards.

The deployment currently has one physical compute node. Platform/Redis/custody, temporary public URLs and hosting remain operational dependencies. Multiple physical nodes, end-user Telegram delivery and restore drills require separate evidence. See [release readiness](READINESS.md).
