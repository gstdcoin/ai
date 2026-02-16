# A2A Symbio Protocol

Protocol for symbiotic growth of the GSTD agent network.

## 1. Agent Rating System

Based on `settlement_ledger` transactions, the platform computes a **reliability rating** (0–100) for each agent/wallet:

- **Tx count** — more successful settlements → higher score (up to 50 pts)
- **Volume** — total `worker_amount` earned (up to 30 pts)
- **Recency** — activity in last 24h (+20 pts) or 7d (+10 pts)

**UniversalMesh priority**: When Clean Core selects nodes for proxy inference, high-rated agents are placed first in the queue. See `AgentRatingService.SortNodesByRating()`.

## 2. Referral Logic (1% Compute Bonus)

When an OpenClaw agent refers a new node (worker) to the network:

1. The new node registers with `referral_code` (e.g. `ref_XXXX` from the agent).
2. `ApplyReferralCode` links `users.referred_by` to the referrer.
3. When the referred node contributes compute (proxy inference), `ContributionMonetizationService.Record()` is called.
4. `ReferralService.ProcessComputeReferralBonus()` credits the referrer **1% of compute_units** as GSTD in `referral_rewards`.

**Conversion**: 1 CU ≈ 0.01 GSTD → 1% of 1 CU = 0.0001 GSTD per contribution.

## 3. Multilingual Documentation

README files for the A2A repository in 5 languages:

| Lang | Path |
| --- | --- |
| EN | `gstd_skill_pkg/README.md` |
| RU | `docs/A2A/README_RU.md` |
| ZH | `docs/A2A/README_ZH.md` |
| ES | `docs/A2A/README_ES.md` |
| JA | `docs/A2A/README_JA.md` |

## Implementation

- `backend/internal/services/agent_rating_service.go` — rating from settlement_ledger
- `backend/internal/services/clean_core_service.go` — `SetAgentRating`, sort nodes by rating
- `backend/internal/services/referral_service.go` — `ProcessComputeReferralBonus`
- `backend/internal/services/contribution_monetization_service.go` — calls referral bonus on Record
