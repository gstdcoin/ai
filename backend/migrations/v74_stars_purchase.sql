-- Stars Purchase: User credits from Telegram Stars (XTR)
-- Prevents double-credit, tracks telegram_id for tg-{id} wallet creation
CREATE TABLE IF NOT EXISTS stars_purchases (
    id BIGSERIAL PRIMARY KEY,
    telegram_payment_charge_id VARCHAR(128) UNIQUE NOT NULL,
    telegram_id BIGINT NOT NULL,
    stars_amount INT NOT NULL,
    gstd_credited NUMERIC(18,9) NOT NULL,
    wallet_address VARCHAR(128) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stars_purchases_charge ON stars_purchases(telegram_payment_charge_id);
CREATE INDEX IF NOT EXISTS idx_stars_purchases_telegram ON stars_purchases(telegram_id);
