
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

// Load .env
dotenv.config({ path: resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSubtasks() {
    console.log('--- Checking tasks with subtasks ---');

    // Exact query used in the prompt but with hardcoded limit
    const { data, error } = await supabase.rpc('execute_safe_query', {
        query_text: `
            SELECT 
                t.name, 
                t.clickup_task_id,
                (SELECT json_agg(s.name) FROM "tasks_CAG_custom" s WHERE s.parent_task_id = t.clickup_task_id) as subtasks
            FROM "tasks_CAG_custom" t
            WHERE EXISTS (SELECT 1 FROM "tasks_CAG_custom" s WHERE s.parent_task_id = t.clickup_task_id)
            LIMIT 5
        `
    });

    if (error) {
        console.error('Error:', error);
        return;
    }

    console.log('Data sample:', JSON.stringify(data, null, 2));
}

checkSubtasks();
