-- ═══════════════════════════════════════════════════════════════
-- V98: LENDING VAULTS — Gold-Backed Credit Lines
--
-- Core tables for DeFi lending against GSTD collateral.
-- Users deposit GSTD tokens, borrow stablecoins (USDt on TON),
-- and the system monitors collateralization ratios continuously.
-- ═══════════════════════════════════════════════════════════════

-- 1. Vault positions (Collateralized Debt Positions)
CREATE TABLE IF NOT EXISTS lending_vaults (
    id              BIGSERIAL PRIMARY KEY,
    wallet_address  VARCHAR(128) NOT NULL,
    -- Collateral
    collateral_gstd NUMERIC(20,8) NOT NULL DEFAULT 0,
    collateral_usd  NUMERIC(20,4) NOT NULL DEFAULT 0,
    -- Debt
    debt_usdt       NUMERIC(20,4) NOT NULL DEFAULT 0,
    -- Health
    collateral_ratio NUMERIC(8,4) NOT NULL DEFAULT 0,  -- e.g. 1.50 = 150%
    health_factor    NUMERIC(8,4) NOT NULL DEFAULT 999, -- >1 = safe, <1 = liquidatable
    -- Rates
    borrow_apr       NUMERIC(6,4) NOT NULL DEFAULT 0.0500, -- 5% default
    accrued_interest NUMERIC(20,8) NOT NULL DEFAULT 0,
    -- State
    status          VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','liquidated','closed')),
    liquidation_threshold NUMERIC(6,4) NOT NULL DEFAULT 1.10, -- 110%
    auto_repay      BOOLEAN NOT NULL DEFAULT false,
    -- AI advisor
    ai_risk_score   NUMERIC(6,4) DEFAULT NULL, -- 0-1, set by CompoundAI
    ai_last_advice  TEXT DEFAULT NULL,
    -- Timestamps
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_interest_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(wallet_address)
);

-- 2. Loan transactions (borrow / repay / top-up / withdraw)
CREATE TABLE IF NOT EXISTS lending_transactions (
    id              BIGSERIAL PRIMARY KEY,
    vault_id        BIGINT NOT NULL REFERENCES lending_vaults(id),
    wallet_address  VARCHAR(128) NOT NULL,
    tx_type         VARCHAR(20) NOT NULL CHECK (tx_type IN (
        'deposit',      -- add collateral
        'withdraw',     -- remove collateral
        'borrow',       -- take loan
        'repay',        -- pay back loan
        'interest',     -- accrued interest charge
        'liquidation'   -- forced sale
    )),
    amount_gstd     NUMERIC(20,8) DEFAULT 0,
    amount_usdt     NUMERIC(20,4) DEFAULT 0,
    gstd_price_usd  NUMERIC(16,8) DEFAULT 0, -- price at time of tx
    collateral_ratio_after NUMERIC(8,4) DEFAULT 0,
    tx_hash         VARCHAR(128) DEFAULT NULL, -- on-chain hash if applicable
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Liquidation events
CREATE TABLE IF NOT EXISTS lending_liquidations (
    id              BIGSERIAL PRIMARY KEY,
    vault_id        BIGINT NOT NULL REFERENCES lending_vaults(id),
    wallet_address  VARCHAR(128) NOT NULL,
    collateral_seized_gstd NUMERIC(20,8) NOT NULL DEFAULT 0,
    debt_covered_usdt      NUMERIC(20,4) NOT NULL DEFAULT 0,
    liquidation_penalty_pct NUMERIC(6,4) NOT NULL DEFAULT 0.05, -- 5%
    gstd_price_at_liquidation NUMERIC(16,8) NOT NULL DEFAULT 0,
    liquidator_reward_gstd    NUMERIC(20,8) NOT NULL DEFAULT 0,
    safety_fund_share_gstd    NUMERIC(20,8) NOT NULL DEFAULT 0,
    tx_hash         VARCHAR(128) DEFAULT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Safety module fund
CREATE TABLE IF NOT EXISTS lending_safety_fund (
    id              BIGSERIAL PRIMARY KEY,
    balance_gstd    NUMERIC(20,8) NOT NULL DEFAULT 0,
    balance_usdt    NUMERIC(20,4) NOT NULL DEFAULT 0,
    total_deposits  NUMERIC(20,8) NOT NULL DEFAULT 0,
    total_payouts   NUMERIC(20,8) NOT NULL DEFAULT 0,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Insert initial safety fund row
INSERT INTO lending_safety_fund (balance_gstd, balance_usdt) 
VALUES (0, 0) ON CONFLICT DO NOTHING;

-- 5. Platform lending configuration (singleton)
CREATE TABLE IF NOT EXISTS lending_config (
    id              INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    min_collateral_ratio    NUMERIC(6,4) NOT NULL DEFAULT 1.50, -- 150% 
    liquidation_threshold   NUMERIC(6,4) NOT NULL DEFAULT 1.10, -- 110%
    liquidation_penalty     NUMERIC(6,4) NOT NULL DEFAULT 0.05, -- 5% penalty
    max_borrow_apr          NUMERIC(6,4) NOT NULL DEFAULT 0.08, -- 8%
    min_borrow_apr          NUMERIC(6,4) NOT NULL DEFAULT 0.03, -- 3%
    safety_fund_fee_pct     NUMERIC(6,4) NOT NULL DEFAULT 0.10, -- 10% of fees to safety
    max_ltv                 NUMERIC(6,4) NOT NULL DEFAULT 0.65, -- 65% max loan-to-value
    min_deposit_gstd        NUMERIC(20,8) NOT NULL DEFAULT 10,  -- min 10 GSTD
    enabled                 BOOLEAN NOT NULL DEFAULT true,
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO lending_config (id) VALUES (1) ON CONFLICT DO NOTHING;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_lending_vaults_wallet ON lending_vaults(wallet_address);
CREATE INDEX IF NOT EXISTS idx_lending_vaults_status ON lending_vaults(status);
CREATE INDEX IF NOT EXISTS idx_lending_vaults_health ON lending_vaults(health_factor) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_lending_tx_vault ON lending_transactions(vault_id);
CREATE INDEX IF NOT EXISTS idx_lending_tx_wallet ON lending_transactions(wallet_address);
CREATE INDEX IF NOT EXISTS idx_lending_liquidations_vault ON lending_liquidations(vault_id);
