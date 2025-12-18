#!/bin/bash

# Trello Intelligence - Supabase Setup Script
# This script helps you set up the database schema in Supabase

echo "================================================"
echo "   Trello Intelligence - Supabase Setup"
echo "================================================"
echo ""

echo "📋 Instructions:"
echo ""
echo "1. Open your Supabase project in browser:"
echo "   https://ielepjtjbrdtoosrzuur.supabase.co"
echo ""
echo "2. Click 'SQL Editor' in the left sidebar"
echo ""
echo "3. Click 'New Query' button"
echo ""
echo "4. Copy and paste the contents of:"
echo "   supabase/migrations/001_initial_schema.sql"
echo ""
echo "5. Click 'Run' to execute"
echo ""
echo "6. Repeat steps 3-5 for:"
echo "   supabase/migrations/002_query_function.sql"
echo ""
echo "================================================"
echo ""
echo "📄 Migration File 1: Database Schema"
echo "================================================"
cat supabase/migrations/001_initial_schema.sql
echo ""
echo "================================================"
echo ""
echo "📄 Migration File 2: Query Function"
echo "================================================"
cat supabase/migrations/002_query_function.sql
echo ""
echo "================================================"
echo ""
echo "✅ After running both migrations, you're ready to start!"
echo ""
