-- Migration v4.2: Final Hardening & Terminology Fix

-- 1. Окончательное переименование полей (Regulatory Clean)
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tasks' AND column_name='reward_amount_ton') THEN
        ALTER TABLE tasks RENAME COLUMN reward_amount_ton TO labor_compensation_ton;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tasks' AND column_name='priority_score') THEN
        ALTER TABLE tasks RENAME COLUMN priority_score TO certainty_gravity_score;
    END IF;
END $$;

-- 2. Таблица для скользящей статистики (Physics Optimization)
CREATE TABLE IF NOT EXISTS moving_entropy_stats (
    operation_id VARCHAR(50) PRIMARY KEY,
    recent_errors_json JSONB DEFAULT '[]', -- Скользящее окно последних 100 результатов
    current_temp DECIMAL(10, 6) DEFAULT 0.1
);

-- 3. Очистка старых индексов
DROP INDEX IF EXISTS idx_tasks_status_priority;
CREATE INDEX IF NOT EXISTS idx_tasks_physics ON tasks(status, certainty_gravity_score DESC, labor_compensation_ton DESC);

