CREATE TABLE IF NOT EXISTS tokenomics_halving (
    epoch_number INTEGER PRIMARY KEY,
    max_supply_cap DOUBLE PRECISION NOT NULL DEFAULT 1000000000,
    current_circulating DOUBLE PRECISION NOT NULL DEFAULT 0,
    total_burned DOUBLE PRECISION NOT NULL DEFAULT 0,
    total_minted_in_epoch DOUBLE PRECISION NOT NULL DEFAULT 0,
    base_reward_per_hour DOUBLE PRECISION NOT NULL DEFAULT 0.01,
    burn_rate_pct DOUBLE PRECISION NOT NULL DEFAULT 2.0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO tokenomics_halving (epoch_number, max_supply_cap, current_circulating, total_burned, total_minted_in_epoch, base_reward_per_hour, burn_rate_pct)
VALUES (1, 1000000000, 0, 0, 0, 0.01, 2.0)
ON CONFLICT (epoch_number) DO UPDATE
SET max_supply_cap = 1000000000;
