-- Migration v3.0: Global Compute Layer

-- 1. Многомерная модель доверия (Trust Vector)
ALTER TABLE devices 
ADD COLUMN IF NOT EXISTS accuracy_score DECIMAL(5, 4) DEFAULT 0.5,
ADD COLUMN IF NOT EXISTS latency_score DECIMAL(5, 4) DEFAULT 0.5,
ADD COLUMN IF NOT EXISTS stability_score DECIMAL(5, 4) DEFAULT 0.5,
ADD COLUMN IF NOT EXISTS last_reputation_update TIMESTAMP;

-- 2. Параметры качества для задач
ALTER TABLE tasks 
ADD COLUMN IF NOT EXISTS confidence_depth INTEGER DEFAULT 1, -- Cd(G)
ADD COLUMN IF NOT EXISTS confidence_score DECIMAL(5, 4) DEFAULT 0.0, -- Итоговая уверенность результата
ADD COLUMN IF NOT EXISTS priority_tier VARCHAR(10) DEFAULT 'standard'; -- flash, standard, economy

-- 3. Индексы для сверхбыстрой выборки (v3 Scaling)
CREATE INDEX IF NOT EXISTS idx_devices_vector ON devices(accuracy_score DESC, latency_score DESC, stability_score DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_depth ON tasks(status, confidence_depth);

