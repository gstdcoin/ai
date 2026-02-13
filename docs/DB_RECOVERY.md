# Database Recovery: pg_statistic TOAST Corruption

## Problem
Error: `unexpected chunk number 1 (expected 0) for toast value in pg_toast_2619`

The corruption was in **pg_statistic** (system catalog), not in the nodes table. Queries to nodes failed because the planner tried to read corrupted statistics.

## Solution Applied
1. `ALTER SYSTEM SET allow_system_table_mods = ON`
2. Restart PostgreSQL
3. `TRUNCATE pg_catalog.pg_statistic`
4. `ANALYZE` (rebuilds all statistics)
5. `ALTER SYSTEM RESET allow_system_table_mods`
6. Restart PostgreSQL

## Migration
See `backend/migrations/v50_fix_nodes_toast_corruption.sql` for the truncate+analyze steps (run after enabling allow_system_table_mods and restarting).
