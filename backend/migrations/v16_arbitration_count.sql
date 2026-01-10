-- Migration: Add arbitration_count column to tasks table
-- Purpose: Track arbitration attempts to prevent infinite loops
-- Date: 2025-01-10

-- Add arbitration_count column if it doesn't exist
ALTER TABLE tasks 
ADD COLUMN IF NOT EXISTS arbitration_count INTEGER DEFAULT 0;

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_tasks_arbitration_count ON tasks(arbitration_count);

-- Add comment
COMMENT ON COLUMN tasks.arbitration_count IS 'Number of arbitration attempts for this task (max 3)';
