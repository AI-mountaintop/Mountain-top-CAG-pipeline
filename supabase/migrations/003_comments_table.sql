-- Comments table: stores task comments
CREATE TABLE IF NOT EXISTS "comments_CAG_custom" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id UUID NOT NULL REFERENCES "tasks_CAG_custom"(id) ON DELETE CASCADE,
  clickup_id TEXT UNIQUE NOT NULL,
  text TEXT,
  comment_text TEXT, -- Full comment text
  "user" JSONB DEFAULT '{}'::jsonb, -- {id, username, email, profilePicture}
  resolved BOOLEAN DEFAULT FALSE,
  assignee JSONB, -- Assigned user if comment is an assignment
  assigned_by JSONB, -- User who made the assignment
  reactions JSONB DEFAULT '[]'::jsonb, -- Array of reaction objects
  date TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_comments_CAG_custom_task_id ON "comments_CAG_custom"(task_id);
CREATE INDEX idx_comments_CAG_custom_clickup_id ON "comments_CAG_custom"(clickup_id);
CREATE INDEX idx_comments_CAG_custom_date ON "comments_CAG_custom"(date);

-- Trigger for updated_at
CREATE TRIGGER update_comments_CAG_custom_updated_at BEFORE UPDATE ON "comments_CAG_custom"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE "comments_CAG_custom" IS 'Stores ClickUp task comments';
