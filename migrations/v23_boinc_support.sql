-- Migration: Add BOINC support to tasks
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS is_boinc BOOLEAN DEFAULT FALSE;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS boinc_project_url TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS boinc_batch_id INTEGER;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS boinc_job_name TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS boinc_account_key TEXT; -- Encrypted or stored as is if testing
