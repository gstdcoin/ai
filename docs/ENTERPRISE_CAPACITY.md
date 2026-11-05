# Enterprise capacity and mobile session status
Enterprise API keys do not authorize paid models or movement of GSTD. Funded wallet/grant inference remains the paid path.

Every enterprise inference entry point (chat completions and oracle evaluation) admits a bounded request atomically against a key-scoped UTC monthly capacity counter before dispatch. The legacy configuration name monthly_limit_tokens now bounds **capacity units**, not independently measured model tokens.

Admission units = UTF-8 input bytes + 1024 per message + maximum requested output tokens. This is a declared conservative service allowance. It is not an exact tokenizer count, a USD invoice, an earnings calculation or a proof of node usage. Executor-reported token counts never expand or refund this allowance.

After dispatch, timeouts, missing usage and uncertain results do not refund capacity. No available node means no admission. An optional Idempotency-Key prevents repeated admission for that key for one hour; requests without it get a unique server ID. A retry after uncertainty may consume another allowance and must be deliberate. Monthly counters are durable and scoped by month; request identity records expire after one hour. Storage errors fail closed.

The new counter starts enforcing requests admitted after deployment. Historical usage reports are not a verified capacity ledger and are not retroactively converted into money or claims. Use capacity accounting returned with successful enterprise responses for admission state; old usage token reports are diagnostic only.

Mobile status now requires signed Telegram initData in X-Telegram-Init-Data. The Telegram owner is derived from that proof. device_id is a bounded scalar query value; optional tg_user_id must match the authenticated owner. Responses are private/no-store. Presence-only mobile sessions show zero rate and zero accumulated rewards.
