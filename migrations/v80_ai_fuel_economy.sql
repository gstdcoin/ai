-- AI Fuel Economy: tier system tracking columns
ALTER TABLE users ADD COLUMN IF NOT EXISTS ai_requests_count INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS ai_daily_count INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_ai_request_date DATE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS cocoon_interactions INTEGER DEFAULT 0;

-- Ensure burn_fund exists in platform_funds
INSERT INTO platform_funds (fund_type, balance_gstd) VALUES ('burn_fund', 0)
ON CONFLICT (fund_type) DO NOTHING;
