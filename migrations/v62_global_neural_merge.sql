-- Global Neural Merge Protocol: Intelligence Consolidation checkpoint
-- Tracks last synced Leviathan lesson ID for merging long_term_lessons → agent_knowledge

CREATE TABLE IF NOT EXISTS global_merge_checkpoint (
    id SERIAL PRIMARY KEY,
    source TEXT NOT NULL DEFAULT 'leviathan_long_term_lessons',
    last_synced_lesson_id BIGINT NOT NULL DEFAULT 0,
    last_synced_at TIMESTAMPTZ DEFAULT NOW(),
    lessons_synced_count INT DEFAULT 0
);
INSERT INTO global_merge_checkpoint (source, last_synced_lesson_id)
SELECT 'leviathan_long_term_lessons', 0
WHERE NOT EXISTS (SELECT 1 FROM global_merge_checkpoint LIMIT 1);
