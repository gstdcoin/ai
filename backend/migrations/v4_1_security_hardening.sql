-- Migration v4.1: Security Hardening & Stabilization

-- 1. Параметры для защиты от Gravity Wells
ALTER TABLE tasks 
ADD COLUMN IF NOT EXISTS min_reward_floor DECIMAL(18, 9) DEFAULT 0.0001,
ADD COLUMN IF NOT EXISTS is_spot_check BOOLEAN DEFAULT false;

-- 2. Глобальная статистика сети (Network Temperature)
CREATE TABLE IF NOT EXISTS network_health (
    id SERIAL PRIMARY KEY,
    avg_latency_ms INTEGER,
    global_entropy DECIMAL(5, 4),
    active_nodes INTEGER,
    recorded_at TIMESTAMP DEFAULT NOW()
);

-- 3. Ограничение на минимальную избыточность (Anti-Death-Spiral)
ALTER TABLE operation_entropy 
ADD COLUMN IF NOT EXISTS min_allowed_redundancy DECIMAL(3, 2) DEFAULT 1.05; 

