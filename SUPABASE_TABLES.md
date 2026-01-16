# Supabase Tables Required for ClickUp Intelligence

## 📋 Tables to Create

You need to create **4 tables** in your Supabase database. All tables have the `_CAG_custom` suffix as required.

### 1. `lists_CAG_custom`
Stores ClickUp list metadata and sync status.

**Columns:**
- `id` (UUID, Primary Key)
- `clickup_list_id` (TEXT, Unique)
- `name` (TEXT)
- `url` (TEXT)
- `description` (TEXT, nullable)
- `space_id` (TEXT)
- `space_name` (TEXT)
- `folder_id` (TEXT, nullable)
- `folder_name` (TEXT, nullable)
- `workspace_id` (TEXT)
- `workspace_name` (TEXT)
- `last_synced` (TIMESTAMPTZ, nullable)
- `created_at` (TIMESTAMPTZ)
- `updated_at` (TIMESTAMPTZ)

### 2. `tasks_CAG_custom`
Stores ClickUp task data with all metadata.

**Columns:**
- `id` (UUID, Primary Key)
- `list_id` (UUID, Foreign Key → lists_CAG_custom.id)
- `clickup_task_id` (TEXT, Unique)
- `custom_id` (TEXT, nullable)
- `name` (TEXT)
- `description` (TEXT, nullable)
- `text_content` (TEXT, nullable)
- `position` (DECIMAL)
- `due_date` (TIMESTAMPTZ, nullable)
- `start_date` (TIMESTAMPTZ, nullable)
- `date_closed` (TIMESTAMPTZ, nullable)
- `date_done` (TIMESTAMPTZ, nullable)
- `is_archived` (BOOLEAN)
- `status` (TEXT)
- `status_color` (TEXT)
- `status_type` (TEXT)
- `priority` (TEXT)
- `priority_color` (TEXT)
- `tags` (JSONB) - Array of tag objects
- `assignees` (JSONB) - Array of assignee objects
- `watchers` (JSONB) - Array of watcher objects
- `checklists` (JSONB) - Array of checklist data
- `custom_fields` (JSONB) - Array of custom field data
- `creator` (JSONB) - Creator object
- `time_estimate` (INTEGER, nullable)
- `time_spent` (INTEGER, nullable)
- `points` (INTEGER, nullable)
- `url` (TEXT)
- `created_at` (TIMESTAMPTZ)
- `updated_at` (TIMESTAMPTZ)

### 3. `comments_CAG_custom`
Stores ClickUp task comments.

**Columns:**
- `id` (UUID, Primary Key)
- `task_id` (UUID, Foreign Key → tasks_CAG_custom.id)
- `clickup_id` (TEXT, Unique)
- `text` (TEXT, nullable)
- `comment_text` (TEXT, nullable)
- `user` (JSONB) - User object
- `resolved` (BOOLEAN)
- `assignee` (JSONB, nullable)
- `assigned_by` (JSONB, nullable)
- `reactions` (JSONB) - Array of reaction objects
- `date` (TIMESTAMPTZ)
- `created_at` (TIMESTAMPTZ)
- `updated_at` (TIMESTAMPTZ)

### 4. `webhooks_CAG_custom`
Tracks registered ClickUp webhooks for each list.

**Columns:**
- `id` (UUID, Primary Key)
- `list_id` (UUID, Foreign Key → lists_CAG_custom.id)
- `clickup_webhook_id` (TEXT, Unique)
- `callback_url` (TEXT)
- `is_active` (BOOLEAN)
- `last_event_at` (TIMESTAMPTZ, nullable)
- `created_at` (TIMESTAMPTZ)

## 🚀 How to Create These Tables

### Option 1: Run Migration Files (Recommended)

1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Run these migration files **in order**:
   - `supabase/migrations/001_initial_schema.sql` (creates lists_CAG_custom, tasks_CAG_custom, webhooks_CAG_custom)
   - `supabase/migrations/002_query_function.sql` (creates the execute_safe_query function)
   - `supabase/migrations/003_comments_table.sql` (creates comments_CAG_custom)

### Option 2: Manual Creation

If you prefer to create tables manually, copy the SQL from the migration files and run them in Supabase SQL Editor.

## ✅ Verification

After running the migrations, verify the tables exist:

```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name LIKE '%_CAG_custom';
```

You should see:
- `lists_CAG_custom`
- `tasks_CAG_custom`
- `comments_CAG_custom`
- `webhooks_CAG_custom`

## 📝 Notes

- All tables use UUID primary keys
- Foreign key relationships are set up with CASCADE deletes
- Indexes are created for optimal query performance
- Triggers are set up to automatically update `updated_at` timestamps
- The `execute_safe_query` function is required for the AI chat feature to work

