-- Market Ascension: First-Query Bonus (0.05 GSTD for new users first test request)
ALTER TABLE users ADD COLUMN IF NOT EXISTS first_query_bonus_used BOOLEAN DEFAULT false;
UPDATE users SET first_query_bonus_used = false WHERE first_query_bonus_used IS NULL;
