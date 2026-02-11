-- Migration v5.0: Network Physics & Regulatory Hardening

-- 1. Таблица физического состояния сети (Real-time Physics)
CREATE TABLE IF NOT EXISTS network_physics (
    id SERIAL PRIMARY KEY,
    temperature DECIMAL(10, 6), -- T: Global Error Rate
    pressure DECIMAL(10, 6),    -- P: Computational Density (Tasks/Nodes)
    entropy_gradient DECIMAL(10, 6), -- ∇E: Rate of error change
    recorded_at TIMESTAMP DEFAULT NOW()
);

-- 2. Обновление терминологии в задачах
ALTER TABLE tasks 
RENAME COLUMN reward_amount_ton TO labor_compensation_ton;

-- 3. Добавление физических параметров в задачи
ALTER TABLE tasks 
ADD COLUMN IF NOT EXISTS required_certainty_level DECIMAL(5, 4) DEFAULT 0.95,
ADD COLUMN IF NOT EXISTS computational_pressure_impact DECIMAL(10, 6) DEFAULT 0.0;

