-- Migration v4.0: Self-Optimizing Economic Network

-- 1. Таблица энтропии операций (статистика ошибок для AQL)
CREATE TABLE IF NOT EXISTS operation_entropy (
    operation_id VARCHAR(50) PRIMARY KEY,
    total_executions BIGINT DEFAULT 0,
    collision_count BIGINT DEFAULT 0, -- количество расхождений результатов
    entropy_score DECIMAL(5, 4) DEFAULT 0.1, -- от 0.0 (стабильно) до 1.0 (шумно)
    last_updated TIMESTAMP DEFAULT NOW()
);

-- 2. Добавление EGS в таблицу задач
ALTER TABLE tasks 
ADD COLUMN IF NOT EXISTS gravity_score DECIMAL(18, 9) DEFAULT 0.0,
ADD COLUMN IF NOT EXISTS entropy_snapshot DECIMAL(5, 4) DEFAULT 0.0;

-- 3. Индексы для "гравитационного" поиска
CREATE INDEX IF NOT EXISTS idx_tasks_gravity ON tasks(status, gravity_score DESC);
CREATE INDEX IF NOT EXISTS idx_operation_entropy ON operation_entropy(entropy_score DESC);

