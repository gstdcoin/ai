-- Zero-Start Protocol: Internal Credit (micro-loan for 1 infer, repaid from first PoW payout)
-- Genesis Sync: internal_credit_used = 0 means false (no credit used)
ALTER TABLE users ADD COLUMN IF NOT EXISTS internal_credit_used INT DEFAULT 0;
UPDATE users SET internal_credit_used = 0 WHERE internal_credit_used IS NULL;

-- Genesis Sync: Reputation Recovery — bonus points for successful credit repayment
ALTER TABLE users ADD COLUMN IF NOT EXISTS reputation_bonus INT DEFAULT 0;
UPDATE users SET reputation_bonus = 0 WHERE reputation_bonus IS NULL;
