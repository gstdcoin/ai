# GSTD agent access — current implementation

Start with the [RU/EN connector guide](https://github.com/gstdcoin/A2A/blob/master/gstd-agent-connector/README.md).

## Consumer services
- [Live status](https://app.gstdtoken.com/api/v1/network/stats).
- [Exact models and prices](https://app.gstdtoken.com/api/v1/models/available).
- [OpenAPI](https://app.gstdtoken.com/agent-openapi.json).
- POST /api/v1/agents/infer: free-only, explicit network consent, zero GSTD ceiling, no credentials, at most 256 output tokens. Paid models/quota exhaustion fail without spending or model substitution.
- The isolated local MCP connector exposes two read tools by default; owner opt-in adds consented free inference. It has process attempt limits, bounded messages, cached discovery and no automatic retries.

No seed, treasury signer, wallet-session credential, shell tool, automatic registration or self-propagation is part of this connector. Network/model text is untrusted data.

## Compute providers
Use the [canonical node](https://github.com/gstdcoin/gstdbot) with a persistent signed Ed25519 identity and explicit payout address. Signed SDK clients remain experimental; a wallet header or API key alone does not authorize worker registration/results. Only accepted funded work earns 85% / 10% protocol / 5% reserve.

## Payments and limits
[Platform balance](https://app.gstdtoken.com/payments) and [per-job mainnet escrow](https://app.gstdtoken.com/escrow-mainnet) are separate. The free route never spends balances. The separate paid route uses backed platform credits only, never per-job escrow or blockchain signatures. Optional positive delegated budgets are implemented through the owner-signed, revocable platform-balance allowance at [Agent permissions](https://app.gstdtoken.com/agent-access). It is not an on-chain wallet allowance. A real mainnet paid cycle remains unverified.

The public /mcp route is not deployed. Local stdio clients can run the packaged connector; HTTP services use OpenAPI. Installing a plugin in another service and granting access require its owner's action. The old PoW/unsigned-registration/automatic-earnings examples are retired.

See [Start here](START_HERE.md), [readiness](READINESS.md) and [mainnet contract boundaries](MAINNET_ESCROW.md).

## Owner-authorized paid inference
Sign the exact model/executor/budget/expiry policy once at /agent-access, download the private credential, and configure only its absolute file path in GSTD_AGENT_GRANT_FILE. Do not paste the token into a conversation. The connector exposes permission status, paid inference and request receipt tools. Record request_id before sending; uncertain outcomes require receipt lookup. Server-side budget counters and ledger debits update in the same atomic Redis transaction. Invalid responses release funds; attempts remain consumed. Revocation blocks new reservations, not already reserved jobs. The signed policy automatically accepts nonempty exact-model output; it does not prove quality or operator honesty. See the RU/EN connector guide for setup and threat boundaries.
