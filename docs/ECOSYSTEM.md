# GSTD: one network, three ways to use it

The product starts with utility, not token purchase. The three supported entry paths are: ask AI, connect a node, and build with the node API. Telegram is another interface to the same platform, not a second network.

## Canonical entry points

| Need | Entry | Responsibility |
|---|---|---|
| Ask AI without installation | https://gstdtoken.com/ai | Chat; identify node versus Cloudflare fallback honestly |
| Platform chat and network status | https://app.gstdtoken.com | Canonical registry, queue, assignment and accepted-result accounting |
| AI in Telegram | https://t.me/gstdaibot | Platform webhook, six locales, conversation state and bounded daily use |
| Contribute compute | https://gstdtoken.com/nodes | One canonical installer from gstdcoin/gstdbot; installed models perform real work |
| Build an application | https://gstdtoken.com/developers | A first OpenAI-compatible request to an operator gateway |

A wallet is not needed to try the free AI chat. GSTD is the compute payment token. Funded accepted work and on-chain settlement are separate from free/unfunded tasks; neither free chat nor mere presence promises a payout.

## One execution path

A registered node owns a persistent Ed25519 identity and operator wallet. Signed heartbeats publish its current public address to app.gstdtoken.com. Gateways submit inference through the canonical queue; the existing worker wakes, computes locally, signs its completion, and makes the accepted result available. Browser and Telegram interfaces call live node inference; Cloudflare AI, when used, is labeled as fallback.

Applications start with HTTP POST /v1/chat/completions on an operator gateway. model=auto selects a model; messages carry the conversation; max_tokens bounds generation; stream=true produces SSE. Developers should agree access, rate limits and payment with the operator, keep secrets server-side, and avoid hardcoding temporary tunnel addresses.

## Keep it small

Reuse the existing website, platform, node and Telegram webhook. Do not add a new backend, parallel registry, app shell, token gate for first chat, or artificial dashboard metrics. Keep the free-tier schedules in [FREE_TIER_REQUEST_BUDGET.md](FREE_TIER_REQUEST_BUDGET.md). Add new task kinds only when an actual executor, validation and a simple user path exist.

The current acceptance evidence covers a single physical node and installed llama3.2:3b. Independent multi-host consensus, distributed training, the bridge and mainnet settlement are outside that evidence. The temporary tunnel and Telegram owner setup remain explicit operational boundaries.
