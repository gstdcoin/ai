-- Migration v2.0: Enterprise & Scaling updates

-- 1. Расширение таблицы устройств (Trust & Latency)
ALTER TABLE devices 
ADD COLUMN IF NOT EXISTS trust_score DECIMAL(5, 4) DEFAULT 0.1,
ADD COLUMN IF NOT EXISTS region VARCHAR(10) DEFAULT 'unknown',
ADD COLUMN IF NOT EXISTS latency_fingerprint INTEGER DEFAULT 0; -- в мс

-- 2. Расширение таблицы задач (Enterprise Features)
ALTER TABLE tasks 
ADD COLUMN IF NOT EXISTS min_trust_score DECIMAL(5, 4) DEFAULT 0.0,
ADD COLUMN IF NOT EXISTS geo_restriction VARCHAR(10)[], -- массив разрешенных регионов
ADD COLUMN IF NOT EXISTS is_private BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS redundancy_factor INTEGER DEFAULT 1; -- сколько раз нужно выполнить

-- 3. Индексы для корзин приоритетов (Scaling)
CREATE INDEX IF NOT EXISTS idx_tasks_priority_bucket ON tasks(status, priority_score DESC, min_trust_score ASC);
CREATE INDEX IF NOT EXISTS idx_devices_trust_region ON devices(trust_score DESC, region);

