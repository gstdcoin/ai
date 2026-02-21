-- Migration v29: Add completed_at to tasks
-- Purpose: Fix missing column causing 500 errors in GetMyTasks and task completion
-- Date: 2026-01-19

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP;
