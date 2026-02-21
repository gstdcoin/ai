-- Migration v50: Fix pg_statistic TOAST corruption
-- Error: unexpected chunk number 1 (expected 0) for toast value in pg_toast_2619
-- Root cause: pg_statistic (system catalog) had corrupted TOAST data, not nodes table.
-- Solution: Truncate pg_statistic and rebuild with ANALYZE.
-- Requires: allow_system_table_mods = ON (set manually, restart, then run this).
-- After fix: ALTER SYSTEM RESET allow_system_table_mods; (restart to apply).

-- Run during maintenance window. Steps:
-- 1. ALTER SYSTEM SET allow_system_table_mods = ON;
-- 2. Restart PostgreSQL
-- 3. TRUNCATE pg_catalog.pg_statistic;
-- 4. ANALYZE;
-- 5. ALTER SYSTEM RESET allow_system_table_mods;
-- 6. Restart PostgreSQL

TRUNCATE pg_catalog.pg_statistic;
ANALYZE;
