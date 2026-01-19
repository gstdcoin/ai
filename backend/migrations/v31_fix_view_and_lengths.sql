-- Migration v31: Fix view dependency and resize pow_challenges.worker_wallet
-- Purpose: Resize worker_wallet in pow_challenges by dropping/recreating dependent view
-- Date: 2026-01-19

DROP VIEW IF EXISTS pow_statistics;

ALTER TABLE pow_challenges ALTER COLUMN worker_wallet TYPE VARCHAR(128);

CREATE OR REPLACE VIEW pow_statistics AS
 SELECT date_trunc('hour'::text, pow_challenges.created_at) AS hour,
    count(*) AS total_challenges,
    count(*) FILTER (WHERE (pow_challenges.verified = true)) AS verified_count,
    round(avg(pow_challenges.difficulty), 1) AS avg_difficulty,
    count(DISTINCT pow_challenges.worker_wallet) AS unique_workers
   FROM pow_challenges
  WHERE (pow_challenges.created_at > (now() - '24:00:00'::interval))
  GROUP BY (date_trunc('hour'::text, pow_challenges.created_at))
  ORDER BY (date_trunc('hour'::text, pow_challenges.created_at)) DESC;
