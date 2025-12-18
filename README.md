# Trello Intelligence

Production-grade, event-driven Trello analytics application powered by AI. Ask natural language questions about your Trello boards and get instant insights.

## 🚀 Features

- **Zero Polling Architecture**: Real-time updates via Trello webhooks
- **AI-Powered Querying**: Ask questions in natural language, get SQL-based insights
- **Multi-Board Support**: Manage and query 100+ boards efficiently
- **Strict Security Guardrails**: Read-only queries with board scoping and result limits
- **Denormalized Schema**: Optimized for fast analytical queries
- **Time-Based Filters**: Query changes by time without scheduled syncs
- **Modular Design**: Easily extensible to other tools (Jira, Asana, etc.)

## 🏗️ Architecture

```
┌─────────────────┐
│  Trello Boards  │
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
2. **Trello API Credentials**:
   - Get your API key: https://trello.com/app-key
   - Generate a token (click the token link on the API key page)
   - Note your API secret (shown on the API key page)
3. **OpenAI API Key**: [Get API key](https://platform.openai.com/api-keys)
4. **Public HTTPS URL** for webhooks:
   - For development: Use [ngrok](https://ngrok.com) or [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)
   - For production: Deploy to Vercel, Railway, or similar

## 🛠️ Setup Instructions

### 1. Clone and Install Dependencies

```bash
cd trello-intelligence
npm install
```

### 2. Set Up Supabase Database

1. Create a new Supabase project at https://supabase.com
2. Go to **SQL Editor** in your Supabase dashboard
3. Run the migration files in order:
   - Copy and execute `supabase/migrations/001_initial_schema.sql`
   - Copy and execute `supabase/migrations/002_query_function.sql`
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

# Trello
TRELLO_API_KEY=your-trello-api-key
TRELLO_API_TOKEN=your-trello-token
TRELLO_API_SECRET=your-trello-secret
TRELLO_WEBHOOK_CALLBACK_URL=https://your-domain.com/api/webhooks/trello

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
# TRELLO_WEBHOOK_CALLBACK_URL=https://abc123.ngrok.io/api/webhooks/trello
```

**For Production**:
Deploy to Vercel and use your production domain.

### 5. Run the Application

```bash
npm run dev
```

Open http://localhost:3000

## 📖 Usage Guide

### Adding a Board

1. Copy your Trello board URL (e.g., `https://trello.com/b/abc123/my-board`)
2. Paste it into the "Add Trello Board" input
3. Click "Add & Sync Board"
4. Wait for initial sync to complete (fetches all lists and cards)
5. Webhook is automatically registered for real-time updates

### Querying with Natural Language

Select a board and ask questions like:

- "What cards are due this week?"
- "Show me all cards in the 'In Progress' list"
- "What changed in the last 10 minutes?"
- "Which cards have no due date?"
- "Show me cards with the 'urgent' label"
- "How many cards are in each list?"

### Understanding Time-Based Queries

The system tracks the `updated_at` timestamp for every card. When you ask "What changed in the last X minutes/hours", it queries this field directly—no polling needed!

## 🔒 Security Features

- **Board Scoping**: All queries must include `WHERE board_id = $1`
- **Read-Only**: No INSERT, UPDATE, DELETE, or DDL operations allowed
- **Result Limits**: Maximum 1000 rows per query
- **Webhook Signature Validation**: HMAC-SHA1 verification for all webhook events
- **Parameterized Queries**: SQL injection prevention

## 🧪 Testing

### Test Initial Sync

```bash
curl -X POST http://localhost:3000/api/boards/add \
  -H "Content-Type: application/json" \
  -d '{"boardUrl": "https://trello.com/b/YOUR_BOARD_ID/board-name"}'
```

### Test Webhook (simulate Trello event)

1. Make a change to a card in Trello
2. Check your terminal for webhook event logs
3. Verify the `updated_at` timestamp changed in Supabase

### Test LLM Query

Use the chat interface or:

```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "boardId": "your-board-uuid",
    "question": "What cards are due this week?"
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
# Update TRELLO_WEBHOOK_CALLBACK_URL with production URL
```

### Deploy to Railway

1. Push to GitHub
2. Connect repository in Railway
3. Add environment variables
4. Deploy

## 📊 Database Schema

```sql
boards
├── id (UUID, PK)
├── trello_board_id (TEXT, unique)
├── name, url, description
└── last_synced, created_at, updated_at

lists
├── id (UUID, PK)
├── board_id (FK → boards.id)
├── trello_list_id (TEXT, unique)
├── name, position, is_closed
└── created_at, updated_at

cards
├── id (UUID, PK)
├── board_id (FK → boards.id)
├── list_id (FK → lists.id, nullable)
├── trello_card_id (TEXT, unique)
├── name, description, position
├── due_date, due_complete, is_closed
├── labels (JSONB), members (JSONB)
├── checklists (JSONB), attachments (JSONB)
├── status, url
└── created_at, updated_at (INDEXED)

webhooks
├── id (UUID, PK)
├── board_id (FK → boards.id)
├── trello_webhook_id (TEXT, unique)
├── callback_url, is_active
└── last_event_at, created_at
```

## 🔧 Troubleshooting

### Webhook Not Receiving Events

1. Check `TRELLO_WEBHOOK_CALLBACK_URL` is publicly accessible
2. Verify webhook signature validation isn't failing
3. Check Supabase `webhooks` table for `is_active = true`
4. Look for webhook ID in Trello: `https://trello.com/1/tokens/YOUR_TOKEN/webhooks`

### SQL Query Execution Fails

1. Ensure `002_query_function.sql` migration ran successfully
2. Check Supabase logs for RPC errors
3. Verify `execute_safe_query` function exists in SQL Editor

### Rate Limiting

Trello limits: 100 requests/10 seconds, 300 requests/5 minutes. The client automatically handles this with the rate limiter.

## 🛣️ Roadmap

- [ ] Add search functionality for boards
- [ ] Export query results to CSV
- [ ] Card activity timeline visualization
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

Built with ❤️ using Next.js, Supabase, OpenAI, and Trello API
