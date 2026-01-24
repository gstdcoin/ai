# GSTD Mass Adoption Specification (v1.0)

## 1. Viral Expansion (Referral System)
### Concept
"Invite to Earn": Users receive a permanent 5% commission from the GSTD rewards of every user they invite. This incentivizes influencers and community leaders to onboard workers.

### Technical Implementation
*   **Database**: 
    *   `users` table already has `referral_code` and `referred_by`.
    *   `referral_rewards` table tracks earnings.
*   **Logic**:
    *   **Link**: `https://t.me/GSTD_Main_Bot?start=ref_12345` or `https://app.gstdtoken.com?ref=12345`.
    *   **Attribution**: When a user connects wallet, check `localStorage` or Bot `start_payload`. Call `/api/v1/referrals/apply`.
    *   **Payout**: In `PaymentService` (or `ResultService`), when a task is completed:
        *   Calculate `ReferralReward = ExecutorReward * 0.05`.
        *   *Note*: The 5% should come from the **Platform Fee** to avoid penalizing the worker, or be an inflation/treasury subsidy? 
        *   *Decision*: **Subsidized from Platform Fee**. If Platform Fee is 5%, referrer takes 50% of that fee? Or add extra? 
        *   *Proposal*: Platform Fee stays 5%. Referrer gets 1% (20% of fee) or similar. 
        *   *User Request*: "Get +5% of his rewards". This implies `WorkerReward * 0.05`.
        *   To be sustainable, this 5% must come from the **Task Budget** (User pays X, Worker gets 0.95X, Referrer gets 0.05X?) No, worker expects full pay.
        *   **Solution**: The Referrer Reward is processed as a separate ledger entry credited from the **Marketing/Treasury Wallet**.
*   **Bot Command**: `/ref` -> Generates link and shows stats.

## 2. Anti-Cheat & Identity
### Device Fingerprinting
*   **Method**: Browser Fingerprint (Canvas, AudioContext, ScreenRes, Timezone).
*   **Library**: `marketing-pipeline/fingerprintjs` (Open Source version).
*   **Storage**: Store hash in `devices` table columns `fingerprint_hash`.
*   **Rule**: `SELECT COUNT(*) FROM devices WHERE fingerprint_hash = ?`. If > 3, block registration.

### Proof of Personhood
*   **Level 1**: **Telegram Premium Check**. (Bot API `User.IsPremium`). Premium users are prioritized/trusted.
*   **Level 2**: **CAPTCHA on Withdraw**. Simple `hCaptcha` or `Turnstile` before signing the withdrawal transaction.
*   **Level 3**: **Deposit-based Trust**. Workers must hold/stake min 100 GSTD to get "High Priority".

## 3. Dispute Management
### Logic
*   **Trigger**: If `ValidationService` returns `rejected`, Worker sees "Result Rejected". 
*   **Action**: Button "Open Dispute" (Cost: 10 GSTD stake).
*   **Process**:
    1.  Task status -> `disputed`.
    2.  Notify Admin/DAO Channel via Bot.
    3.  Admin checks `Input` vs `Output` manually (or via Golden Node).
    4.  **Verdict**:
        *   **Worker Right**: Refund stake + Award Reward. Penalize Validator.
        *   **Worker Wrong**: Burn stake.
*   **Database**: New table `disputes (id, task_id, worker_address, reason, status, evidence_json)`.

## 4. Financial Resilience (Emergency Fund)
### Logic
*   **concept**: 1% of every transaction is diverted to a separate wallet `EmergencyFundWallet`.
*   **Implementation**: 
    *   In `PaymentService`, split `PlatformFee` (5%):
        *   4% -> Admin/Operations.
        *   1% -> Reserve Fund (Cold Wallet).
    *   **Auto-Trigger**: If `GasWallet` balance < 1 TON, trigger alert to refill from Reserve.

## 5. UI Micro-Interactions
*   **Toasts**: Already using `sonner`. Ensure coverage for:
    *   Mining Start/Stop.
    *   Task Arrived (Sound effect?).
    *   Reward Credited (Confetti?).
*   **Skeletons**: Use `react-loading-skeleton` in `DevicesPanel` and `StatsPanel`.

## 6. Edge Cases
*   **Retry Queue**: 
    *   `WorkerService.ts` currently sends result once.
    *   **Enhancement**: Implement `IndexedDB` or `localStorage` queue.
    *   On `submitResult` failure (network/500): Save `{task_id, result}` to queue.
    *   `RetryLoop`: Every 30s check queue and retry.

## VERDICT
**GSTD IS 95% READY.** 
The core is solid. The "Social" and "Defense" layers described above are the final 5% to allow scaling from 10k to 1M users without collapse.
