# ClickUp Intelligence

Production-grade, event-driven ClickUp analytics application powered by AI. Ask natural language questions about your ClickUp lists and get instant insights.

## 🚀 Features

- **Zero Polling Architecture**: Real-time updates via ClickUp webhooks
- **AI-Powered Querying**: Ask questions in natural language, get SQL-based insights
- **Multi-List Support**: Manage and query 100+ lists efficiently
- **Strict Security Guardrails**: Read-only queries with list scoping and result limits
- **Denormalized Schema**: Optimized for fast analytical queries
- **Time-Based Filters**: Query changes by time without scheduled syncs
- **Modular Design**: Easily extensible to other tools (Jira, Asana, etc.)

## 🏗️ Architecture

```
┌─────────────────┐
│  ClickUp Lists  │
└────────┬────────┘
         │ Webhooks
         ▼
┌─────────────────┐      ┌──────────────┐
│   Next.js API   │◄─────┤  PostgreSQL  │
│   (Node.js)     │      │  (Supabase)  │
└────────┬────────┘      └──────────────┘
         │
         ▼
┌─────────────────┐      ┌──────────────┐
│  OpenAI GPT-4   │      │   Frontend   │
│  (LLM Layer)    │◄─────┤    (React)   │
└─────────────────┘      └──────────────┘
```

## 📋 Prerequisites

1. **Supabase Account**: [Create free account](https://supabase.com)
2. **ClickUp API Credentials**:
   - Get your API token: https://app.clickup.com/settings/apps
   - Create an app in ClickUp settings to get Client ID
   - Generate a webhook secret for signature verification
3. **OpenAI API Key**: [Get API key](https://platform.openai.com/api-keys)
4. **Public HTTPS URL** for webhooks:
   - For development: Use [ngrok](https://ngrok.com) or [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)
   - For production: Deploy to Vercel, Railway, or similar

## 🛠️ Setup Instructions

### 1. Clone and Install Dependencies

```bash
cd clickup-intelligence
npm install
```

### 2. Set Up Supabase Database

1. Create a new Supabase project at https://supabase.com
2. Go to **SQL Editor** in your Supabase dashboard
3. Run the migration files in order:
   - Copy and execute `supabase/migrations/001_initial_schema.sql`
   - Copy and execute `supabase/migrations/002_query_function.sql`
   - Copy and execute `supabase/migrations/003_comments_table.sql`
4. Get your project credentials:
   - **Project URL**: Settings → API → Project URL
   - **Anon Key**: Settings → API → anon/public key
   - **Service Role Key**: Settings → API → service_role key

### 3. Configure Environment Variables

Create a `.env.local` file (copy from `env.example`):

```bash
cp env.example .env.local
```

Fill in your credentials:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# ClickUp
CLICKUP_API_TOKEN=your-clickup-api-token
CLICKUP_CLIENT_ID=your-clickup-client-id
CLICKUP_WEBHOOK_SECRET=your-webhook-secret
CLICKUP_WEBHOOK_CALLBACK_URL=https://your-domain.com/api/webhooks/clickup

# OpenAI
OPENAI_API_KEY=your-openai-api-key
```

### 4. Set Up Webhook Callback URL

**For Development (using ngrok)**:

```bash
# Install ngrok: https://ngrok.com/download
ngrok http 3000

# Copy the HTTPS URL (e.g., https://abc123.ngrok.io)
# Update .env.local:
# CLICKUP_WEBHOOK_CALLBACK_URL=https://abc123.ngrok.io/api/webhooks/clickup
```

**For Production**:
Deploy to Vercel and use your production domain.

### 5. Run the Application

```bash
npm run dev
```

Open http://localhost:3000

## 📖 Usage Guide

### Adding a List

1. Copy your ClickUp list URL (e.g., `https://app.clickup.com/{workspaceId}/v/li/{listId}/...`)
2. Paste it into the "Add ClickUp List" input
3. Click "Add & Sync List"
4. Wait for initial sync to complete (fetches all tasks and comments)
5. Webhook is automatically registered for real-time updates

### Querying with Natural Language

Select a list and ask questions like:

- "What tasks are due this week?"
- "Show me all tasks with status 'In Progress'"
- "What changed in the last 10 minutes?"
- "Which tasks have no due date?"
- "Show me tasks with the 'urgent' tag"
- "Show me tasks assigned to John"
- "How many tasks are in each status?"

### Understanding Time-Based Queries

The system tracks the `updated_at` timestamp for every task. When you ask "What changed in the last X minutes/hours", it queries this field directly—no polling needed!

## 🔒 Security Features

- **List Scoping**: All queries must include `WHERE list_id = $1`
- **Read-Only**: No INSERT, UPDATE, DELETE, or DDL operations allowed
- **Result Limits**: Maximum 1000 rows per query
- **Webhook Signature Validation**: HMAC-SHA256 verification for all webhook events
- **Parameterized Queries**: SQL injection prevention

## 🧪 Testing

### Test Initial Sync

```bash
curl -X POST http://localhost:3000/api/boards/add \
  -H "Content-Type: application/json" \
  -d '{"boardUrl": "https://app.clickup.com/.../li/YOUR_LIST_ID/..."}'
```

### Test Webhook (simulate ClickUp event)

1. Make a change to a task in ClickUp
2. Check your terminal for webhook event logs
3. Verify the `updated_at` timestamp changed in Supabase

### Test LLM Query

Use the chat interface or:

```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "boardId": "your-list-uuid",
    "question": "What tasks are due this week?"
  }'
```

## 🚀 Deployment

### Deploy to Vercel (Recommended)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Set environment variables in Vercel dashboard
# Update CLICKUP_WEBHOOK_CALLBACK_URL with production URL
```

### Deploy to Railway

1. Push to GitHub
2. Connect repository in Railway
3. Add environment variables
4. Deploy

## 📊 Database Schema

```sql
lists
├── id (UUID, PK)
├── clickup_list_id (TEXT, unique)
├── name, url, description
├── space_id, space_name
├── folder_id, folder_name (nullable)
├── workspace_id, workspace_name
└── last_synced, created_at, updated_at

tasks
├── id (UUID, PK)
├── list_id (FK → lists.id)
├── clickup_task_id (TEXT, unique)
├── name, description, text_content
├── position, due_date, start_date
├── status, status_color, status_type
├── priority, priority_color
├── tags (JSONB), assignees (JSONB), watchers (JSONB)
├── checklists (JSONB), custom_fields (JSONB)
├── creator (JSONB)
├── time_estimate, time_spent, points
├── url
└── created_at, updated_at (INDEXED)

comments
├── id (UUID, PK)
├── task_id (FK → tasks.id)
├── clickup_id (TEXT, unique)
├── text, comment_text
├── user (JSONB), assignee (JSONB), assigned_by (JSONB)
├── reactions (JSONB)
└── date, created_at, updated_at

webhooks
├── id (UUID, PK)
├── list_id (FK → lists.id)
├── clickup_webhook_id (TEXT, unique)
├── callback_url, is_active
└── last_event_at, created_at
```

## 🔧 Troubleshooting

### Webhook Not Receiving Events

1. Check `CLICKUP_WEBHOOK_CALLBACK_URL` is publicly accessible
2. Verify webhook signature validation isn't failing
3. Check Supabase `webhooks` table for `is_active = true`
4. Look for webhook ID in ClickUp: Check your app settings

### SQL Query Execution Fails

1. Ensure `002_query_function.sql` migration ran successfully
2. Check Supabase logs for RPC errors
3. Verify `execute_safe_query` function exists in SQL Editor

### Rate Limiting

ClickUp limits: 100 requests per minute per workspace. The client automatically handles this with the rate limiter.

## 🛣️ Roadmap

- [ ] Add search functionality for lists
- [ ] Export query results to CSV
- [ ] Task activity timeline visualization
- [ ] Slack/Discord notifications for changes
- [ ] Multi-workspace support
- [ ] Jira and Asana integrations
- [ ] Custom SQL templates
- [ ] Advanced analytics dashboard

## 📄 License

MIT

## 🤝 Contributing

Contributions welcome! Please open an issue or PR.

---

Built with ❤️ using Next.js, Supabase, OpenAI, and ClickUp API
