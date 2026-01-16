-- Migration: Add all missing ClickUp columns to properly store all data from ClickUp API
-- This ensures we capture all available fields from ClickUp tasks and lists

-- ============================================
-- TASKS TABLE - Add missing columns
-- ============================================

-- ClickUp original timestamps (separate from our created_at/updated_at)
ALTER TABLE "tasks_CAG_custom" 
ADD COLUMN IF NOT EXISTS date_created TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS date_updated TIMESTAMPTZ;

-- Task hierarchy and relationships
ALTER TABLE "tasks_CAG_custom"
ADD COLUMN IF NOT EXISTS parent_task_id TEXT, -- ClickUp parent task ID for subtasks
ADD COLUMN IF NOT EXISTS dependencies JSONB DEFAULT '[]'::jsonb, -- Array of task dependencies
ADD COLUMN IF NOT EXISTS linked_tasks JSONB DEFAULT '[]'::jsonb; -- Array of linked tasks

-- Team and workspace info
ALTER TABLE "tasks_CAG_custom"
ADD COLUMN IF NOT EXISTS team_id TEXT, -- ClickUp team/workspace ID
ADD COLUMN IF NOT EXISTS permission_level TEXT; -- Task permission level

-- Sharing information
ALTER TABLE "tasks_CAG_custom"
ADD COLUMN IF NOT EXISTS sharing JSONB DEFAULT '{}'::jsonb; -- Sharing settings: {public, public_share_expires_on, public_fields, token, seo_optimized}

-- Status details (additional fields)
ALTER TABLE "tasks_CAG_custom"
ADD COLUMN IF NOT EXISTS status_orderindex INTEGER; -- Status order index

-- Priority details (additional fields)
ALTER TABLE "tasks_CAG_custom"
ADD COLUMN IF NOT EXISTS priority_id TEXT, -- Priority ID
ADD COLUMN IF NOT EXISTS priority_orderindex TEXT; -- Priority order index

-- Order index (raw string from ClickUp)
ALTER TABLE "tasks_CAG_custom"
ADD COLUMN IF NOT EXISTS orderindex TEXT; -- Raw orderindex string from ClickUp

-- Context information (list, project, folder, space details)
ALTER TABLE "tasks_CAG_custom"
ADD COLUMN IF NOT EXISTS list_info JSONB DEFAULT '{}'::jsonb, -- {id, name, access}
ADD COLUMN IF NOT EXISTS project_info JSONB DEFAULT '{}'::jsonb, -- {id, name, hidden, access}
ADD COLUMN IF NOT EXISTS folder_info JSONB DEFAULT '{}'::jsonb, -- {id, name, hidden, access}
ADD COLUMN IF NOT EXISTS space_info JSONB DEFAULT '{}'::jsonb; -- {id}

-- ============================================
-- LISTS TABLE - Add missing columns
-- ============================================

-- List metadata
ALTER TABLE "lists_CAG_custom"
ADD COLUMN IF NOT EXISTS orderindex INTEGER, -- List order index
ADD COLUMN IF NOT EXISTS statuses JSONB DEFAULT '[]'::jsonb, -- Available statuses for this list
ADD COLUMN IF NOT EXISTS permission_level TEXT, -- List permission level
ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT FALSE, -- Whether list is archived
ADD COLUMN IF NOT EXISTS task_count INTEGER; -- Number of tasks in list

-- ============================================
-- CREATE INDEXES for new columns
-- ============================================

-- Task indexes
CREATE INDEX IF NOT EXISTS idx_tasks_CAG_custom_parent_task_id ON "tasks_CAG_custom"(parent_task_id);
CREATE INDEX IF NOT EXISTS idx_tasks_CAG_custom_team_id ON "tasks_CAG_custom"(team_id);
CREATE INDEX IF NOT EXISTS idx_tasks_CAG_custom_date_created ON "tasks_CAG_custom"(date_created);
CREATE INDEX IF NOT EXISTS idx_tasks_CAG_custom_date_updated ON "tasks_CAG_custom"(date_updated);
CREATE INDEX IF NOT EXISTS idx_tasks_CAG_custom_dependencies ON "tasks_CAG_custom" USING GIN(dependencies);
CREATE INDEX IF NOT EXISTS idx_tasks_CAG_custom_linked_tasks ON "tasks_CAG_custom" USING GIN(linked_tasks);

-- List indexes
CREATE INDEX IF NOT EXISTS idx_lists_CAG_custom_is_archived ON "lists_CAG_custom"(is_archived);
CREATE INDEX IF NOT EXISTS idx_lists_CAG_custom_statuses ON "lists_CAG_custom" USING GIN(statuses);

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON COLUMN "tasks_CAG_custom".date_created IS 'Original creation date from ClickUp (milliseconds timestamp)';
COMMENT ON COLUMN "tasks_CAG_custom".date_updated IS 'Last update date from ClickUp (milliseconds timestamp)';
COMMENT ON COLUMN "tasks_CAG_custom".parent_task_id IS 'ClickUp parent task ID for subtasks';
COMMENT ON COLUMN "tasks_CAG_custom".dependencies IS 'JSONB array of task dependencies';
COMMENT ON COLUMN "tasks_CAG_custom".linked_tasks IS 'JSONB array of linked tasks';
COMMENT ON COLUMN "tasks_CAG_custom".team_id IS 'ClickUp team/workspace ID';
COMMENT ON COLUMN "tasks_CAG_custom".permission_level IS 'Task permission level (private, public, etc.)';
COMMENT ON COLUMN "tasks_CAG_custom".sharing IS 'Sharing settings: public, expiration, fields, token';
COMMENT ON COLUMN "tasks_CAG_custom".status_orderindex IS 'Status order index for sorting';
COMMENT ON COLUMN "tasks_CAG_custom".priority_id IS 'Priority ID from ClickUp';
COMMENT ON COLUMN "tasks_CAG_custom".priority_orderindex IS 'Priority order index';
COMMENT ON COLUMN "tasks_CAG_custom".orderindex IS 'Raw orderindex string from ClickUp';
COMMENT ON COLUMN "tasks_CAG_custom".list_info IS 'List context: {id, name, access}';
COMMENT ON COLUMN "tasks_CAG_custom".project_info IS 'Project context: {id, name, hidden, access}';
COMMENT ON COLUMN "tasks_CAG_custom".folder_info IS 'Folder context: {id, name, hidden, access}';
COMMENT ON COLUMN "tasks_CAG_custom".space_info IS 'Space context: {id}';

COMMENT ON COLUMN "lists_CAG_custom".orderindex IS 'List order index';
COMMENT ON COLUMN "lists_CAG_custom".statuses IS 'Available statuses for this list (JSONB array)';
COMMENT ON COLUMN "lists_CAG_custom".permission_level IS 'List permission level';
COMMENT ON COLUMN "lists_CAG_custom".is_archived IS 'Whether the list is archived';
COMMENT ON COLUMN "lists_CAG_custom".task_count IS 'Number of tasks in the list';

