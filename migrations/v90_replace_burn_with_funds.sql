-- Migration v90: Replace burn_fund with purpose-driven funds
-- Replaces deflationary burn with real fund destinations
-- 
-- FUND MAP (correct):
--   development_fund → UQA5HpVG96CBqR000VmY9PjyFCwUbuaiWWYv7lrZtEyD_Z3P (Binance TON deposit — project dev)
--   cocoon_fund      → UQCkXFlNRsubUp7Uh7lg_ScUqLCiff1QCLsdQU0a7kphqQED  (Admin wallet — Cocoon AI compute)
--   gold_reserve     → EQA--JXG8VSyBJmLMqb2J2t4Pya0TS9SXHh7vHh8Iez25sLp  (STON.fi XAUt/GSTD pool)
--   gold_reserve NOTE: GSTD funds are swapped → XAUt and added as liquidity to STON.fi pool
--   Pool URL: https://app.ston.fi/liquidity/provide?type=Balanced&ft=XAUt0
--             &tt=EQDv6cYW9nNiKjN3Nwl8D6ABjUiH1gYfWVGZhfP7-9tZskTO
--             &pool=EQA--JXG8VSyBJmLMqb2J2t4Pya0TS9SXHh7vHh8Iez25sLp

-- Add destination columns
ALTER TABLE platform_funds ADD COLUMN IF NOT EXISTS destination_wallet VARCHAR(128);
ALTER TABLE platform_funds ADD COLUMN IF NOT EXISTS description TEXT;

-- Create new funds
INSERT INTO platform_funds (fund_type, balance_gstd) VALUES ('development_fund', 0)
    ON CONFLICT (fund_type) DO NOTHING;

INSERT INTO platform_funds (fund_type, balance_gstd) VALUES ('cocoon_fund', 0)
    ON CONFLICT (fund_type) DO NOTHING;

-- Set correct destinations
UPDATE platform_funds SET
    destination_wallet = 'UQA5HpVG96CBqR000VmY9PjyFCwUbuaiWWYv7lrZtEyD_Z3P',
    description        = 'Binance TON deposit — project development fund'
WHERE fund_type = 'development_fund';

UPDATE platform_funds SET
    destination_wallet = 'UQCkXFlNRsubUp7Uh7lg_ScUqLCiff1QCLsdQU0a7kphqQED',
    description        = 'Admin wallet — Cocoon AI compute fund'
WHERE fund_type = 'cocoon_fund';

UPDATE platform_funds SET
    destination_wallet = 'EQA--JXG8VSyBJmLMqb2J2t4Pya0TS9SXHh7vHh8Iez25sLp',
    description        = 'STON.fi XAUt/GSTD pool — GSTD is swapped to XAUt and added as liquidity'
WHERE fund_type = 'gold_reserve';
