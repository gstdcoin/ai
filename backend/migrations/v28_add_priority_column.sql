-- v28_add_priority_column.sql
-- Add priority column to tasks table for orchestrator

-- Add priority column if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'tasks' AND column_name = 'priority'
    ) THEN
        ALTER TABLE tasks ADD COLUMN priority INTEGER DEFAULT 5;
        COMMENT ON COLUMN tasks.priority IS 'Task priority: 1=critical, 5=normal, 10=low';
    END IF;
END $$;

-- Add deadline column if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'tasks' AND column_name = 'deadline'
    ) THEN
        ALTER TABLE tasks ADD COLUMN deadline TIMESTAMP WITH TIME ZONE DEFAULT NULL;
        COMMENT ON COLUMN tasks.deadline IS 'Task deadline for priority calculation';
    END IF;
END $$;

-- Add max_retries column if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'tasks' AND column_name = 'max_retries'
    ) THEN
        ALTER TABLE tasks ADD COLUMN max_retries INTEGER DEFAULT 3;
        COMMENT ON COLUMN tasks.max_retries IS 'Maximum retry attempts for failed task';
    END IF;
END $$;

-- Add retry_count column if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'tasks' AND column_name = 'retry_count'
    ) THEN
        ALTER TABLE tasks ADD COLUMN retry_count INTEGER DEFAULT 0;
        COMMENT ON COLUMN tasks.retry_count IS 'Current retry count';
    END IF;
END $$;

-- Add required_cpu and required_ram_gb if not exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'tasks' AND column_name = 'required_cpu'
    ) THEN
        ALTER TABLE tasks ADD COLUMN required_cpu INTEGER DEFAULT 1;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'tasks' AND column_name = 'required_ram_gb'
    ) THEN
        ALTER TABLE tasks ADD COLUMN required_ram_gb INTEGER DEFAULT 1;
    END IF;
END $$;

-- Create index for priority queue
CREATE INDEX IF NOT EXISTS idx_tasks_priority_created ON tasks(priority, created_at) WHERE status IN ('pending', 'queued');

-- Update existing tasks with default priority
UPDATE tasks SET priority = 5 WHERE priority IS NULL;

ANALYZE tasks;

-- Create worker_load table for tracking worker capacity
CREATE TABLE IF NOT EXISTS worker_load (
    worker_wallet VARCHAR(100) PRIMARY KEY,
    current_tasks INTEGER DEFAULT 0,
    max_capacity INTEGER DEFAULT 5,
    cpu_cores INTEGER DEFAULT 4,
    ram_gb INTEGER DEFAULT 8,
    last_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    geography VARCHAR(100) DEFAULT 'global',
    trust_score DECIMAL(3,2) DEFAULT 0.50
);

CREATE INDEX IF NOT EXISTS idx_worker_load_last_seen ON worker_load(last_seen);
CREATE INDEX IF NOT EXISTS idx_worker_load_capacity ON worker_load(current_tasks) WHERE current_tasks < max_capacity;

COMMENT ON TABLE worker_load IS 'Real-time worker load tracking for task distribution';
