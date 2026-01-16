# ClickUp Intelligence - Setup Requirements

This document outlines what you need to provide to complete the setup of the ClickUp Intelligence application.

## ✅ What Has Been Completed

The application is set up for ClickUp:
- ✅ ClickUp API client created
- ✅ Database schema updated for ClickUp (lists, tasks, comments)
- ✅ Sync functionality implemented
- ✅ Webhook handler created
- ✅ All API routes updated
- ✅ Frontend components updated
- ✅ Documentation updated

## 📋 What You Need to Provide

### 1. ClickUp API Credentials

#### ClickUp API Token
- **How to get it:**
  1. Log into ClickUp
  2. Click your profile picture (top right) → Settings
  3. Go to "Apps" → "API"
  4. Copy your API token
- **Where to use:** `CLICKUP_API_TOKEN` in `.env.local`

#### ClickUp Client ID
- **How to get it:**
  1. In ClickUp Settings → Apps → API
  2. Click "Create an App" or use existing app
  3. Copy the Client ID
- **Where to use:** `CLICKUP_CLIENT_ID` in `.env.local`

#### ClickUp Webhook Secret (Optional but Recommended)
- **How to get it:**
  1. In ClickUp Settings → Apps → API
  2. Generate a webhook secret for signature verification
- **Where to use:** `CLICKUP_WEBHOOK_SECRET` in `.env.local`

### 2. Supabase Project Credentials (NEW PROJECT)

Since this is for a new client, you need to create a **NEW Supabase project**:

#### Steps:
1. Go to https://supabase.com
2. Create a new project
3. Wait for the project to be set up
4. Go to Settings → API
5. Copy the following:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role key** → `SUPABASE_SERVICE_ROLE_KEY`

#### Database Setup:
1. In your new Supabase project, go to SQL Editor
2. Run these migration files in order:
   - `supabase/migrations/001_initial_schema.sql`
   - `supabase/migrations/002_query_function.sql`
   - `supabase/migrations/003_comments_table.sql`

### 3. OpenAI API Key

- **How to get it:**
  1. Go to https://platform.openai.com/api-keys
  2. Create a new API key or use existing one
- **Where to use:** `OPENAI_API_KEY` in `.env.local`

### 4. Webhook Callback URL

#### For Development:
- Use ngrok or similar tool to expose your local server
- Format: `https://your-ngrok-url.ngrok.io/api/webhooks/clickup`

#### For Production:
- Use your production domain
- Format: `https://your-domain.com/api/webhooks/clickup`

## 📝 Environment Variables Template

Create a `.env.local` file in the `clickup-intelligence` directory:

```env
# Supabase (NEW PROJECT - DO NOT USE OLD CREDENTIALS)
NEXT_PUBLIC_SUPABASE_URL=https://your-new-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-new-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-new-service-role-key

# ClickUp
CLICKUP_API_TOKEN=your-clickup-api-token
CLICKUP_CLIENT_ID=your-clickup-client-id
CLICKUP_WEBHOOK_SECRET=your-webhook-secret
CLICKUP_WEBHOOK_CALLBACK_URL=https://your-domain.com/api/webhooks/clickup

# OpenAI
OPENAI_API_KEY=your-openai-api-key

# Application
NODE_ENV=development
```

## 🚀 Next Steps After Setup

1. **Install dependencies:**
   ```bash
   cd clickup-intelligence
   npm install
   ```

2. **Run database migrations** in Supabase SQL Editor (as mentioned above)

3. **Start the development server:**
   ```bash
   npm run dev
   ```

4. **Test the application:**
   - Open http://localhost:3000
   - Add a ClickUp list URL
   - Try asking questions in the chat interface

## ⚠️ Important Notes

1. **DO NOT use the old Supabase credentials** - This is a new client, so use a new Supabase project
2. **ClickUp API Token** - Make sure the token has access to the workspace/lists you want to sync
3. **Webhook URL** - Must be publicly accessible (use ngrok for development)
4. **Database Migrations** - Must be run in order in the new Supabase project

## 🆘 Need Help?

If you encounter any issues:
1. Check the README.md for detailed setup instructions
2. Verify all environment variables are set correctly
3. Check Supabase logs for database errors
4. Check browser console and server logs for API errors

