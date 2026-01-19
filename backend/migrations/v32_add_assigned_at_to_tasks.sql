-- Migration v32: Add assigned_at to tasks
-- Purpose: Add missing assigned_at column to tasks table to fix 500 errors
-- Date: 2026-01-19

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMP WITHOUT TIME ZONE;
