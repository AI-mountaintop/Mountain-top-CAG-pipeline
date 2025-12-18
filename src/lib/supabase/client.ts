import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key';
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// Client-side Supabase client (with anon key)
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Server-side Supabase client (with service role key for admin operations)
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey || supabaseAnonKey);

// Type definitions for database tables
export interface Board {
  id: string;
  trello_board_id: string;
  name: string;
  url: string;
  description?: string;
  last_synced?: string;
  created_at: string;
  updated_at: string;
}

export interface List {
  id: string;
  board_id: string;
  trello_list_id: string;
  name: string;
  position: number;
  is_closed: boolean;
  created_at: string;
  updated_at: string;
}

export interface Card {
  id: string;
  board_id: string;
  list_id?: string;
  trello_card_id: string;
  name: string;
  description?: string;
  position: number;
  due_date?: string;
  due_complete: boolean;
  is_closed: boolean;
  labels: Array<{ id: string; name: string; color: string }>;
  members: Array<{ id: string; username: string; fullName: string }>;
  checklists: any[];
  attachments: any[];
  status?: string;
  url?: string;
  created_at: string;
  updated_at: string;
}

export interface Webhook {
  id: string;
  board_id: string;
  trello_webhook_id: string;
  callback_url: string;
  is_active: boolean;
  last_event_at?: string;
  created_at: string;
}
