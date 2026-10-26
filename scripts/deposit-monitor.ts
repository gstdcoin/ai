#!/usr/bin/env tsx
/**
 * Legacy polling monitor retired. It used an in-memory cursor and trusted
 * notification payloads. Confirm deposits with the authenticated v2 endpoint:
 * POST /api/v1/credits/deposit { tx_hash } using the depositing wallet session.
 * The platform verifies the raw canonical-GSTD receipt and keeps permanent
 * idempotency. Do not re-enable notification-based balance credits.
 */
console.error('Legacy deposit polling is disabled. Use verified v2 receipt confirmation; see docs/FINANCE_V2.md.');
process.exitCode = 1;
export {};
