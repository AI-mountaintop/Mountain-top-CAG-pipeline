-- Create task_due_date_history table for tracking due date changes
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS task_due_date_history (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    task_id UUID REFERENCES "tasks_CAG_custom"(id) ON DELETE CASCADE,
    clickup_task_id TEXT NOT NULL,
    old_due_date TIMESTAMPTZ,
    new_due_date TIMESTAMPTZ,
    changed_at TIMESTAMPTZ DEFAULT NOW(),
    changed_by JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_due_date_history_task ON task_due_date_history(task_id);
CREATE INDEX IF NOT EXISTS idx_due_date_history_clickup ON task_due_date_history(clickup_task_id);
CREATE INDEX IF NOT EXISTS idx_due_date_history_changed_at ON task_due_date_history(changed_at);

-- Enable RLS (Row Level Security) - adjust policies as needed
ALTER TABLE task_due_date_history ENABLE ROW LEVEL SECURITY;

-- Grant access to service role
GRANT ALL ON task_due_date_history TO service_role;
