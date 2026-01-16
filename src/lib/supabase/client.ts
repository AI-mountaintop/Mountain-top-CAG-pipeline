import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key';
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// Client-side Supabase client (with anon key)
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Server-side Supabase client (with service role key for admin operations)
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey || supabaseAnonKey);

// Type definitions for database tables
// Type definitions for database tables
export interface List {
  id: string;
  clickup_list_id: string;
  name: string;
  url: string;
  space_id: string;
  space_name: string;
  folder_id?: string;
  folder_name?: string;
  workspace_id: string;
  workspace_name: string;
  last_synced?: string;
  created_at: string;
  updated_at: string;
}

export interface Task {
  id: string;
  list_id: string;
  clickup_task_id: string;
  name: string;
  description?: string;
  text_content?: string;
  status?: string;
  priority?: string;
  due_date?: string;
  start_date?: string;
  date_closed?: string;
  date_done?: string;
  assignees: any[];
  tags: any[];
  url: string;
  created_at: string;
  updated_at: string;
}

export interface Comment {
  id: string;
  task_id: string;
  clickup_id: string;
  text?: string;
  comment_text?: string;
  user: any;
  date: string;
  created_at: string;
}

export interface Webhook {
  id: string;
  list_id: string;
  clickup_webhook_id: string;
  callback_url: string;
  is_active: boolean;
  last_event_at?: string;
  created_at: string;
}


