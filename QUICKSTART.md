# 🚀 Quick Start Guide

## ✅ Environment Setup - COMPLETED
Your `.env.local` file is configured with:
- ✅ Supabase credentials
- ✅ Trello API credentials  
- ✅ Placeholder OpenAI key (replace later with real key)
- ✅ Webhook URL (will update with ngrok)

---

## 📋 Next Steps

### 1. Set Up Supabase Database (REQUIRED)

Run the setup script to see migration files:
```bash
./setup-supabase.sh
```

**OR manually:**

1. Open: https://ielepjtjbrdtoosrzuur.supabase.co
2. Click **SQL Editor** (left sidebar)
3. Click **New Query**
4. Copy content from `supabase/migrations/001_initial_schema.sql`
5. Paste and click **Run**
6. Repeat for `supabase/migrations/002_query_function.sql`

### 2. Install ngrok (for local webhook testing)

```bash
# Install ngrok
brew install ngrok

# Or download from: https://ngrok.com/download
```

### 3. Start the Development Server

```bash
npm run dev
```

App will run on: http://localhost:3000

### 4. Set Up ngrok Tunnel (in separate terminal)

```bash
ngrok http 3000
```

Copy the HTTPS URL (e.g., `https://abc123.ngrok.io`) and update `.env.local`:
```bash
TRELLO_WEBHOOK_CALLBACK_URL=https://YOUR_NGROK_URL/api/webhooks/trello
```

Then restart the dev server.

---

## 🎯 Testing the App

1. **Add a Trello board:**
   - Copy any Trello board URL
   - Paste into the app
   - Click "Add & Sync Board"

2. **Ask questions:**
   - Select the board
   - Try: "What cards are due this week?"
   - Try: "Show me all cards in progress"

3. **Test webhooks:**
   - Make changes to cards in Trello
   - Query: "What changed in the last 5 minutes?"

---

## 📝 Important Notes

### For Production (Railway Deployment Later):
1. Add all environment variables in Railway dashboard
2. Update `TRELLO_WEBHOOK_CALLBACK_URL` to Railway URL
3. Get real OpenAI API key from: https://platform.openai.com/api-keys

### Current Limitations with Dummy OpenAI Key:
- ❌ Chat/query feature won't work (requires real OpenAI key)
- ✅ Board sync will work
- ✅ Webhook updates will work
- ✅ UI will work

To enable full functionality, get OpenAI key and update `.env.local`

---

## 🐛 Troubleshooting

**Database errors?**
- Make sure both Supabase migrations ran successfully

**Webhook not working?**
- Ensure ngrok is running
- Check `TRELLO_WEBHOOK_CALLBACK_URL` is updated
- Restart dev server after changing env vars

**Build errors?**
- Run `npm install` again
- Delete `.next` folder and rebuild

---

## 📚 Documentation

- Full README: `README.md`
- Walkthrough: See artifacts
- Architecture: Check `implementation_plan.md`
