-- Stars-to-GSTD Buyback: 20% of Telegram Stars -> Ston.fi -> Gold Reserve or burn
CREATE TABLE IF NOT EXISTS stars_payments (
    id BIGSERIAL PRIMARY KEY,
    telegram_payment_charge_id VARCHAR(128) UNIQUE NOT NULL,
    total_amount_stars INT NOT NULL,
    buyback_amount_stars INT NOT NULL,
    buyback_status VARCHAR(32) DEFAULT 'pending',
    gstd_bought NUMERIC(24,9),
    stonfi_tx_hash VARCHAR(128),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_stars_payments_status ON stars_payments(buyback_status);
CREATE INDEX IF NOT EXISTS idx_stars_payments_created ON stars_payments(created_at);
