
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function diagnostic() {
    console.log('--- Diagnostic: Task URLs and Folder Sync ---');

    // 1. Check a few task URLs
    const { data: tasks, error: taskError } = await supabase
        .from('tasks_CAG_custom')
        .select('name, url, clickup_task_id')
        .limit(5);

    if (taskError) {
        console.error('Task fetch error:', taskError);
    } else {
        console.log('Task URL Sample:');
        tasks.forEach(t => console.log(`- ${t.name}: ${t.url} (ID: ${t.clickup_task_id})`));
    }

    // 2. Check lists in the problematic folder
    const folderId = '90147303399';
    const { data: lists, error: listError } = await supabase
        .from('lists_CAG_custom')
        .select('id, name, folder_id, folder_name')
        .eq('folder_id', folderId);

    if (listError) {
        console.error('List fetch error:', listError);
    } else {
        console.log(`\nLists found in folder ${folderId}:`, lists.length);
        lists.forEach(l => console.log(`- ${l.name} (ID: ${l.id})`));
    }

    // 3. Compare with ClickUp API (optional if we have access)
    // For now, let's just see what we have.
}

diagnostic();
