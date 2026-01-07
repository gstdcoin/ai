# Схема базы данных

## Таблицы

### tasks
```sql
CREATE TABLE tasks (
    task_id UUID PRIMARY KEY,
    requester_address VARCHAR(48) NOT NULL,
    task_type VARCHAR(20) NOT NULL, -- inference, human, validation, agent
    operation VARCHAR(50) NOT NULL, -- whitelisted operation
    model VARCHAR(50), -- whitelisted model
    input_source VARCHAR(10) NOT NULL, -- ipfs, http, inline
    input_hash VARCHAR(255),
    input_data TEXT, -- для inline
    constraints_time_limit_sec INTEGER NOT NULL,
    constraints_max_energy_mwh INTEGER NOT NULL,
    reward_amount_ton DECIMAL(18, 9) NOT NULL,
    validation_method VARCHAR(20) NOT NULL, -- reference, majority, ai_check, human
    priority_score DECIMAL(10, 6) NOT NULL,
    status VARCHAR(20) NOT NULL, -- pending, assigned, executing, validating, completed, failed
    created_at TIMESTAMP NOT NULL,
    assigned_at TIMESTAMP,
    completed_at TIMESTAMP,
    escrow_address VARCHAR(48) NOT NULL,
    escrow_amount_ton DECIMAL(18, 9) NOT NULL,
    INDEX idx_status_priority (status, priority_score DESC),
    INDEX idx_requester (requester_address),
    INDEX idx_created_at (created_at)
);
```

### devices
```sql
CREATE TABLE devices (
    device_id VARCHAR(255) PRIMARY KEY, -- fingerprint
    wallet_address VARCHAR(48) NOT NULL UNIQUE,
    device_type VARCHAR(20) NOT NULL, -- android, ios, desktop
    reputation DECIMAL(5, 4) NOT NULL DEFAULT 0.5, -- 0.0 - 1.0
    total_tasks INTEGER NOT NULL DEFAULT 0,
    successful_tasks INTEGER NOT NULL DEFAULT 0,
    failed_tasks INTEGER NOT NULL DEFAULT 0,
    total_energy_consumed INTEGER NOT NULL DEFAULT 0, -- mwh
    average_response_time_ms INTEGER NOT NULL DEFAULT 0,
    cached_models TEXT[], -- массив моделей в кэше
    last_seen_at TIMESTAMP NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    slashing_count INTEGER NOT NULL DEFAULT 0,
    INDEX idx_reputation (reputation DESC),
    INDEX idx_active (is_active, reputation DESC),
    INDEX idx_last_seen (last_seen_at)
);
```

### task_assignments
```sql
CREATE TABLE task_assignments (
    assignment_id UUID PRIMARY KEY,
    task_id UUID NOT NULL REFERENCES tasks(task_id),
    device_id VARCHAR(255) NOT NULL REFERENCES devices(device_id),
    assigned_at TIMESTAMP NOT NULL,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    status VARCHAR(20) NOT NULL, -- assigned, executing, completed, failed, timeout
    result_data JSONB,
    proof_signature VARCHAR(255),
    proof_timestamp BIGINT,
    proof_energy_consumed INTEGER,
    proof_execution_time_ms INTEGER,
    validation_status VARCHAR(20), -- pending, passed, failed
    validation_method VARCHAR(20),
    payment_tx_hash VARCHAR(64),
    payment_status VARCHAR(20), -- pending, completed, failed
    INDEX idx_task (task_id),
    INDEX idx_device (device_id),
    INDEX idx_status (status),
    INDEX idx_assigned_at (assigned_at)
);
```

### validations
```sql
CREATE TABLE validations (
    validation_id UUID PRIMARY KEY,
    task_id UUID NOT NULL REFERENCES tasks(task_id),
    assignment_id UUID NOT NULL REFERENCES task_assignments(assignment_id),
    validation_method VARCHAR(20) NOT NULL,
    reference_result JSONB, -- для reference validation
    majority_results JSONB[], -- для majority vote
    ai_check_confidence DECIMAL(5, 4), -- для ai_check
    human_check_result BOOLEAN, -- для human validation
    human_checker_address VARCHAR(48),
    validation_result VARCHAR(20) NOT NULL, -- passed, failed, pending
    validated_at TIMESTAMP,
    INDEX idx_task (task_id),
    INDEX idx_result (validation_result)
);
```

### requesters
```sql
CREATE TABLE requesters (
    requester_address VARCHAR(48) PRIMARY KEY,
    gstd_balance DECIMAL(18, 9) NOT NULL DEFAULT 0,
    reputation DECIMAL(5, 4) NOT NULL DEFAULT 0.5,
    total_tasks_created INTEGER NOT NULL DEFAULT 0,
    total_tasks_completed INTEGER NOT NULL DEFAULT 0,
    total_ton_spent DECIMAL(18, 9) NOT NULL DEFAULT 0,
    average_validation_success_rate DECIMAL(5, 4) NOT NULL DEFAULT 1.0,
    timely_payments_count INTEGER NOT NULL DEFAULT 0,
    last_activity_at TIMESTAMP NOT NULL,
    INDEX idx_reputation (reputation DESC),
    INDEX idx_balance (gstd_balance DESC)
);
```

### payments
```sql
CREATE TABLE payments (
    payment_id UUID PRIMARY KEY,
    task_id UUID NOT NULL REFERENCES tasks(task_id),
    assignment_id UUID NOT NULL REFERENCES task_assignments(assignment_id),
    device_address VARCHAR(48) NOT NULL,
    amount_ton DECIMAL(18, 9) NOT NULL,
    base_reward DECIMAL(18, 9) NOT NULL,
    energy_bonus DECIMAL(18, 9) NOT NULL DEFAULT 0,
    time_bonus DECIMAL(18, 9) NOT NULL DEFAULT 0,
    reputation_multiplier DECIMAL(5, 4) NOT NULL DEFAULT 1.0,
    tx_hash VARCHAR(64) UNIQUE,
    tx_status VARCHAR(20) NOT NULL, -- pending, confirmed, failed
    created_at TIMESTAMP NOT NULL,
    confirmed_at TIMESTAMP,
    INDEX idx_device (device_address),
    INDEX idx_tx_status (tx_status),
    INDEX idx_created_at (created_at)
);
```

### slashings
```sql
CREATE TABLE slashings (
    slashing_id UUID PRIMARY KEY,
    device_id VARCHAR(255) NOT NULL REFERENCES devices(device_id),
    task_id UUID REFERENCES tasks(task_id),
    assignment_id UUID REFERENCES task_assignments(assignment_id),
    reason VARCHAR(50) NOT NULL, -- invalid_proof, repeated_failures, malicious_behavior, consensus_violation
    severity VARCHAR(10) NOT NULL, -- minor, medium, major, critical
    amount_gstd DECIMAL(18, 9) NOT NULL,
    slashed_at TIMESTAMP NOT NULL,
    INDEX idx_device (device_id),
    INDEX idx_reason (reason)
);
```

### device_metrics
```sql
CREATE TABLE device_metrics (
    metric_id UUID PRIMARY KEY,
    device_id VARCHAR(255) NOT NULL REFERENCES devices(device_id),
    metric_type VARCHAR(20) NOT NULL, -- energy, latency, accuracy
    metric_value DECIMAL(10, 4) NOT NULL,
    recorded_at TIMESTAMP NOT NULL,
    INDEX idx_device_type (device_id, metric_type, recorded_at DESC)
);
```

### task_queue
```sql
CREATE TABLE task_queue (
    queue_id UUID PRIMARY KEY,
    task_id UUID NOT NULL REFERENCES tasks(task_id),
    priority_score DECIMAL(10, 6) NOT NULL,
    queued_at TIMESTAMP NOT NULL,
    assigned_at TIMESTAMP,
    retry_count INTEGER NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL, -- queued, assigned, completed, failed
    INDEX idx_priority (status, priority_score DESC, queued_at ASC),
    INDEX idx_task (task_id)
);
```

## Индексы для производительности

```sql
-- Составные индексы для частых запросов
CREATE INDEX idx_tasks_status_priority_created ON tasks(status, priority_score DESC, created_at ASC);
CREATE INDEX idx_devices_active_reputation ON devices(is_active, reputation DESC);
CREATE INDEX idx_assignments_task_status ON task_assignments(task_id, status);
CREATE INDEX idx_payments_status_created ON payments(tx_status, created_at DESC);
```

## Триггеры

### Обновление репутации устройства
```sql
CREATE OR REPLACE FUNCTION update_device_reputation()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE devices
    SET 
        total_tasks = total_tasks + 1,
        successful_tasks = CASE 
            WHEN NEW.status = 'completed' AND NEW.validation_status = 'passed' 
            THEN successful_tasks + 1 
            ELSE successful_tasks 
        END,
        failed_tasks = CASE 
            WHEN NEW.status = 'failed' OR NEW.validation_status = 'failed' 
            THEN failed_tasks + 1 
            ELSE failed_tasks 
        END,
        reputation = calculate_device_reputation(device_id)
    WHERE device_id = NEW.device_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_device_reputation
AFTER UPDATE ON task_assignments
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status OR OLD.validation_status IS DISTINCT FROM NEW.validation_status)
EXECUTE FUNCTION update_device_reputation();
```

### Обновление статистики заказчика
```sql
CREATE OR REPLACE FUNCTION update_requester_stats()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE requesters
    SET 
        total_tasks_completed = total_tasks_completed + 1,
        total_ton_spent = total_ton_spent + (
            SELECT reward_amount_ton FROM tasks WHERE task_id = NEW.task_id
        ),
        average_validation_success_rate = (
            SELECT AVG(CASE WHEN validation_status = 'passed' THEN 1.0 ELSE 0.0 END)
            FROM task_assignments
            WHERE task_id IN (SELECT task_id FROM tasks WHERE requester_address = (
                SELECT requester_address FROM tasks WHERE task_id = NEW.task_id
            ))
        ),
        reputation = calculate_requester_reputation(requester_address)
    WHERE requester_address = (
        SELECT requester_address FROM tasks WHERE task_id = NEW.task_id
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_requester_stats
AFTER UPDATE ON task_assignments
FOR EACH ROW
WHEN (NEW.status = 'completed' AND NEW.validation_status = 'passed')
EXECUTE FUNCTION update_requester_stats();
```

## Функции расчёта репутации

```sql
CREATE OR REPLACE FUNCTION calculate_device_reputation(p_device_id VARCHAR)
RETURNS DECIMAL(5, 4) AS $$
DECLARE
    v_success_rate DECIMAL(5, 4);
    v_validation_rate DECIMAL(5, 4);
    v_response_score DECIMAL(5, 4);
    v_energy_score DECIMAL(5, 4);
    v_slashing_penalty DECIMAL(5, 4);
    v_reputation DECIMAL(5, 4);
BEGIN
    -- Успешность выполнения
    SELECT 
        CASE 
            WHEN total_tasks > 0 
            THEN successful_tasks::DECIMAL / total_tasks 
            ELSE 0.5 
        END
    INTO v_success_rate
    FROM devices
    WHERE device_id = p_device_id;
    
    -- Скорость ответа (нормализовано, чем меньше - тем лучше)
    SELECT 
        CASE 
            WHEN average_response_time_ms < 1000 THEN 1.0
            WHEN average_response_time_ms < 5000 THEN 1.0 - (average_response_time_ms - 1000) / 4000.0
            ELSE 0.0
        END
    INTO v_response_score
    FROM devices
    WHERE device_id = p_device_id;
    
    -- Энергоэффективность (нормализовано)
    SELECT 
        CASE 
            WHEN total_energy_consumed = 0 THEN 1.0
            WHEN total_tasks > 0 
            THEN GREATEST(0.0, 1.0 - (total_energy_consumed::DECIMAL / total_tasks / 50.0))
            ELSE 0.5
        END
    INTO v_energy_score
    FROM devices
    WHERE device_id = p_device_id;
    
    -- Штрафы
    SELECT 
        CASE 
            WHEN slashing_count = 0 THEN 0.0
            WHEN slashing_count <= 3 THEN slashing_count * 0.05
            ELSE 0.5
        END
    INTO v_slashing_penalty
    FROM devices
    WHERE device_id = p_device_id;
    
    -- Итоговая репутация
    v_reputation := (
        v_success_rate * 0.5 +
        v_response_score * 0.1 +
        v_energy_score * 0.1
    ) - v_slashing_penalty;
    
    RETURN GREATEST(0.0, LEAST(1.0, v_reputation));
END;
$$ LANGUAGE plpgsql;
```

```sql
CREATE OR REPLACE FUNCTION calculate_requester_reputation(p_requester_address VARCHAR)
RETURNS DECIMAL(5, 4) AS $$
DECLARE
    v_completion_rate DECIMAL(5, 4);
    v_validation_rate DECIMAL(5, 4);
    v_payment_rate DECIMAL(5, 4);
    v_reputation DECIMAL(5, 4);
BEGIN
    -- Процент завершённых заданий
    SELECT 
        CASE 
            WHEN total_tasks_created > 0 
            THEN total_tasks_completed::DECIMAL / total_tasks_created 
            ELSE 0.5 
        END
    INTO v_completion_rate
    FROM requesters
    WHERE requester_address = p_requester_address;
    
    -- Успешность валидации
    SELECT average_validation_success_rate
    INTO v_validation_rate
    FROM requesters
    WHERE requester_address = p_requester_address;
    
    -- Своевременность выплат (упрощённо, всегда 1.0 если нет проблем)
    v_payment_rate := 1.0;
    
    -- Итоговая репутация
    v_reputation := (
        v_completion_rate * 0.6 +
        v_validation_rate * 0.3 +
        v_payment_rate * 0.1
    );
    
    RETURN GREATEST(0.0, LEAST(1.0, v_reputation));
END;
$$ LANGUAGE plpgsql;
```

