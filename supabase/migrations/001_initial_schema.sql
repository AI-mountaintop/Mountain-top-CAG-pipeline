-- ClickUp Intelligence - Database Schema (CAG)
-- Denormalized schema optimized for analytical and AI-driven queries

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Lists table: stores ClickUp list metadata
-- In ClickUp, Lists are the main container for tasks
CREATE TABLE IF NOT EXISTS "lists_CAG_custom" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clickup_list_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  description TEXT,
  space_id TEXT, -- ClickUp space ID
  space_name TEXT, -- ClickUp space name
  folder_id TEXT, -- ClickUp folder ID (nullable if list is directly in space)
  folder_name TEXT, -- ClickUp folder name (nullable)
  workspace_id TEXT, -- ClickUp workspace ID
  workspace_name TEXT, -- ClickUp workspace name
  last_synced TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_lists_CAG_custom_clickup_id ON "lists_CAG_custom"(clickup_list_id);
CREATE INDEX idx_lists_CAG_custom_space_id ON "lists_CAG_custom"(space_id);
CREATE INDEX idx_lists_CAG_custom_workspace_id ON "lists_CAG_custom"(workspace_id);

-- Tasks table: denormalized task data with all metadata
CREATE TABLE IF NOT EXISTS "tasks_CAG_custom" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  list_id UUID NOT NULL REFERENCES "lists_CAG_custom"(id) ON DELETE CASCADE,
  clickup_task_id TEXT UNIQUE NOT NULL,
  custom_id TEXT, -- ClickUp custom task ID
  name TEXT NOT NULL,
  description TEXT,
  text_content TEXT, -- Markdown content
  position DECIMAL NOT NULL,
  due_date TIMESTAMPTZ,
  start_date TIMESTAMPTZ,
  date_closed TIMESTAMPTZ,
  date_done TIMESTAMPTZ,
  is_archived BOOLEAN DEFAULT FALSE,
  
  -- Status information
  status TEXT, -- Task status name
  status_color TEXT, -- Status color
  status_type TEXT, -- Status type
  
  -- Priority
  priority TEXT, -- Priority level
  priority_color TEXT, -- Priority color
  
  -- Denormalized JSONB fields for flexible querying
  tags JSONB DEFAULT '[]'::jsonb, -- Array of {name, tag_fg, tag_bg}
  assignees JSONB DEFAULT '[]'::jsonb, -- Array of {id, username, email, profilePicture}
  watchers JSONB DEFAULT '[]'::jsonb, -- Array of {id, username, email, profilePicture}
  checklists JSONB DEFAULT '[]'::jsonb, -- Array of checklist data
  custom_fields JSONB DEFAULT '[]'::jsonb, -- Array of custom field data
  
  -- Creator information
  creator JSONB DEFAULT '{}'::jsonb, -- {id, username, email, profilePicture}
  
  -- Time tracking
  time_estimate INTEGER, -- Estimated time in milliseconds
  time_spent INTEGER, -- Time spent in milliseconds
  points INTEGER, -- Story points
  
  -- URL to task
  url TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tasks_CAG_custom_list_id ON "tasks_CAG_custom"(list_id);
CREATE INDEX idx_tasks_CAG_custom_clickup_id ON "tasks_CAG_custom"(clickup_task_id);
CREATE INDEX idx_tasks_CAG_custom_updated_at ON "tasks_CAG_custom"(updated_at); -- For time-based queries
CREATE INDEX idx_tasks_CAG_custom_due_date ON "tasks_CAG_custom"(due_date);
CREATE INDEX idx_tasks_CAG_custom_status ON "tasks_CAG_custom"(status);
CREATE INDEX idx_tasks_CAG_custom_tags ON "tasks_CAG_custom" USING GIN(tags); -- For JSONB queries
CREATE INDEX idx_tasks_CAG_custom_assignees ON "tasks_CAG_custom" USING GIN(assignees); -- For JSONB queries
CREATE INDEX idx_tasks_CAG_custom_is_archived ON "tasks_CAG_custom"(is_archived);

-- Webhooks table: tracks registered ClickUp webhooks
CREATE TABLE IF NOT EXISTS "webhooks_CAG_custom" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  list_id UUID NOT NULL REFERENCES "lists_CAG_custom"(id) ON DELETE CASCADE,
  clickup_webhook_id TEXT UNIQUE NOT NULL,
  callback_url TEXT NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  last_event_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_webhooks_CAG_custom_list_id ON "webhooks_CAG_custom"(list_id);
CREATE INDEX idx_webhooks_CAG_custom_clickup_id ON "webhooks_CAG_custom"(clickup_webhook_id);

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for automatic updated_at updates
CREATE TRIGGER update_lists_CAG_custom_updated_at BEFORE UPDATE ON "lists_CAG_custom"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tasks_CAG_custom_updated_at BEFORE UPDATE ON "tasks_CAG_custom"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Comments for documentation
COMMENT ON TABLE "lists_CAG_custom" IS 'Stores ClickUp list metadata and sync status';
COMMENT ON TABLE "tasks_CAG_custom" IS 'Denormalized task data optimized for analytical queries';
COMMENT ON TABLE "webhooks_CAG_custom" IS 'Tracks registered ClickUp webhooks for each list';
COMMENT ON COLUMN "tasks_CAG_custom".tags IS 'JSONB array of tag objects with name, tag_fg, and tag_bg';
COMMENT ON COLUMN "tasks_CAG_custom".assignees IS 'JSONB array of assignee objects with id, username, email, and profilePicture';
COMMENT ON COLUMN "tasks_CAG_custom".updated_at IS 'Indexed for time-based delta queries (e.g., changes in last 10 minutes)';
