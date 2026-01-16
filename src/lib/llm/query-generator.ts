import OpenAI from 'openai';
import { supabaseAdmin } from '../supabase/client';
import { openaiRateLimiter, openaiSecondRateLimiter } from '../utils/rate-limiter';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY || 'sk-placeholder',
});

/**
 * Retry OpenAI API call with exponential backoff on rate limit errors
 */
async function retryOpenAICall<T>(
    fn: () => Promise<T>,
    maxRetries: number = 5,
    baseDelay: number = 1000
): Promise<T> {
    let lastError: any;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error: any) {
            lastError = error;

            // Check if it's a rate limit error (429)
            if (error?.status === 429 || error?.message?.includes('Rate limit')) {
                // Extract retry-after from error message if available
                let retryAfter = baseDelay;
                const retryAfterMatch = error?.message?.match(/try again in ([\d.]+)s/i);
                if (retryAfterMatch) {
                    retryAfter = Math.ceil(parseFloat(retryAfterMatch[1]) * 1000) + 500; // Add 500ms buffer
                } else {
                    // Exponential backoff: 1s, 2s, 4s, 8s, 16s
                    retryAfter = baseDelay * Math.pow(2, attempt);
                }

                console.log(`Rate limit hit, retrying in ${retryAfter}ms (attempt ${attempt + 1}/${maxRetries})`);
                await new Promise(resolve => setTimeout(resolve, retryAfter));
                continue;
            }

            // For other errors, throw immediately
            throw error;
        }
    }

    throw lastError;
}

const DATABASE_SCHEMA = `
DATABASE SCHEMA:

Table: "lists_CAG_custom"
- id (UUID, primary key)
- clickup_list_id (TEXT)
- name (TEXT)
- url (TEXT)
- description (TEXT)
- space_id (TEXT)
- space_name (TEXT)
- folder_id (TEXT, nullable)
- folder_name (TEXT, nullable)
- workspace_id (TEXT)
- workspace_name (TEXT)
- last_synced (TIMESTAMPTZ)
- created_at (TIMESTAMPTZ)
- updated_at (TIMESTAMPTZ)

Table: "tasks_CAG_custom"
- id (UUID, primary key)
- list_id (UUID, foreign key to lists_CAG_custom.id)
- clickup_task_id (TEXT)
- custom_id (TEXT, nullable)
- name (TEXT)
- description (TEXT)
- text_content (TEXT)
- position (DECIMAL)
- due_date (TIMESTAMPTZ, nullable)
- start_date (TIMESTAMPTZ, nullable)
- date_closed (TIMESTAMPTZ, nullable)
- date_done (TIMESTAMPTZ, nullable)
- is_archived (BOOLEAN)
- status (TEXT) - Task status name
- status_color (TEXT)
- status_type (TEXT)
- priority (TEXT)
- priority_color (TEXT)
- tags (JSONB) - Array of objects: [{name: string, tag_fg: string, tag_bg: string}]
- assignees (JSONB) - Array of objects: [{id: string, username: string, email: string, profilePicture: string}]
- watchers (JSONB) - Array of objects: [{id: string, username: string, email: string, profilePicture: string}]
- checklists (JSONB)
- custom_fields (JSONB)
- creator (JSONB) - {id: string, username: string, email: string, profilePicture: string}
- time_estimate (INTEGER) - milliseconds
- time_spent (INTEGER) - milliseconds
- points (INTEGER) - story points
- url (TEXT)
- created_at (TIMESTAMPTZ)
- updated_at (TIMESTAMPTZ) - INDEXED for time-based queries

Table: "comments_CAG_custom"
- id (UUID, primary key)
- task_id (UUID, foreign key to tasks_CAG_custom.id)
- clickup_id (TEXT)
- text (TEXT)
- comment_text (TEXT)
- user (JSONB) - {id: string, username: string, email: string, profilePicture: string}
- resolved (BOOLEAN)
- assignee (JSONB, nullable)
- assigned_by (JSONB, nullable)
- reactions (JSONB)
- date (TIMESTAMPTZ)
- created_at (TIMESTAMPTZ)
- updated_at (TIMESTAMPTZ)

IMPORTANT: The updated_at field is automatically updated on any task modification and is indexed for efficient time-based queries.
`;

const SYSTEM_PROMPT = `You are a SQL query generator for a ClickUp list analytics database. Your job is to convert natural language questions into valid PostgreSQL queries.

${DATABASE_SCHEMA}

MANDATORY GUARDRAILS:
    1. ALL queries MUST include a scoping clause:
       - If scope is 'list': "WHERE list_id = $1"
       - If scope is 'folder': "WHERE list_id IN (SELECT id FROM lists_CAG_custom WHERE folder_id = $1)"
    2. ALL queries MUST include a LIMIT clause (default 100, maximum 1000)
    3. ONLY SELECT queries are allowed - NO INSERT, UPDATE, DELETE, DROP, ALTER, GRANT, or any mutation operations
    4. DO NOT access tables other than lists_CAG_custom, tasks_CAG_custom, and comments_CAG_custom
    5. For time-based filters (e.g., "last 10 minutes", "today"), use the updated_at field with INTERVAL arithmetic
    6. IMPORTANT: When selecting date fields (updated_at, created_at, due_date, date_closed, date_done), always use TO_CHAR() to format them as readable dates. Format: TO_CHAR(date_field, 'Month DD, YYYY, HH12:MI AM TZ') as date_field
    6. When querying JSONB fields (tags, assignees, watchers), use PostgreSQL JSONB operators like @>, ->, and ->>
    7. Always use parameterized queries with $1 for list_id (or folder_id)
    8. To query comments, you MUST JOIN the tasks table to filter by list_id/folder_id (e.g., JOIN tasks t ON comments.task_id = t.id WHERE t.list_id = $1)
    9. For status queries, use the status field directly (e.g., WHERE status = 'complete')
    9. For status queries, use the status field directly (e.g., WHERE status = 'complete')
    10. For priority queries, use the priority field directly (e.g., WHERE priority = 'high')
    11. CRITICAL: Table names are CASE SENSITIVE. You MUST ALWAYS use double quotes for ALL table names in EVERY part of the query:
        - Main query: SELECT * FROM "tasks_CAG_custom"
        - Subqueries: WHERE list_id IN (SELECT id FROM "lists_CAG_custom" WHERE ...)
        - Joins: JOIN "comments_CAG_custom" ON ...
        - NEVER write: lists_CAG_custom or tasks_CAG_custom without quotes
        - ALWAYS write: "lists_CAG_custom" and "tasks_CAG_custom" with quotes

    CRITICAL: CONTEXT & FOLLOW-UP QUESTIONS
    - The chat history contains the SQL queries used to generate previous answers.
    - If the user asks a follow-up question (e.g., "who is assigned to them?", "what are the names of those tasks?"), YOU MUST REUSE the filters/conditions from the previous SQL query.
    - DO NOT generate a random query. If the user refers to "those tasks", look at the previous SQL to see what "those tasks" were (e.g., if the previous query filtered by status, you must also filter by that status).
    - If the user asks for specific details about the previously listed items, SELECT those details using the SAME WHERE clause as the previous query.

    CRITICAL: TASK NAME MATCHING
    - When users ask about specific tasks by name (e.g., "QA Testing", "qa testing", "Qa Testing"), ALWAYS use case-insensitive matching with ILIKE.
    - Use ILIKE '%task_name%' to match task names regardless of case (uppercase, lowercase, mixed case).
    - Examples:
      * "what is the due date of QA Testing" → WHERE name ILIKE '%QA Testing%'
      * "what is the due date of qa testing" → WHERE name ILIKE '%qa testing%' (same result)
      * "show me QA Testing task" → WHERE name ILIKE '%QA Testing%'
    - Handle partial matches: "QA" should match "QA Testing", "QA Review", etc.
    - Handle variations: "qa testing" should match "QA Testing", "Qa Testing", "QA TESTING", etc.
    
    CRITICAL: ALWAYS include the 'url' field when selecting task information so users can click through to ClickUp.

    EXAMPLE QUERIES (List Scope):
    Q: "What tasks are due this week?"
    A: SELECT name, url, TO_CHAR(due_date, 'Month DD, YYYY, HH12:MI AM TZ') as due_date, status FROM "tasks_CAG_custom" WHERE list_id = $1 AND due_date >= NOW() AND due_date < NOW() + INTERVAL '7 days' ORDER BY due_date LIMIT 100

    EXAMPLE QUERIES (Folder Scope):
    Q: "What tasks are due this week?"
    A: SELECT name, url, TO_CHAR(due_date, 'Month DD, YYYY, HH12:MI AM TZ') as due_date, status FROM "tasks_CAG_custom" WHERE list_id IN (SELECT id FROM "lists_CAG_custom" WHERE folder_id = $1) AND due_date >= NOW() AND due_date < NOW() + INTERVAL '7 days' ORDER BY due_date LIMIT 100

    Your response should be ONLY the SQL query, nothing else. Do not include explanations, markdown formatting, or any other text.`;

export async function generateSQL(
    question: string,
    entityId: string, // listId or folderId
    history: Array<{ role: 'user' | 'assistant'; content: string; sql?: string }> = [],
    scope: 'list' | 'folder' = 'list'
): Promise<{ sql: string; explanation: string }> {
    try {
        // 1. Fetch context (status values from tasks)
        // Adjust query based on scope
        let query = supabaseAdmin
            .from('tasks_CAG_custom')
            .select('status, name');

        if (scope === 'list') {
            query = query.eq('list_id', entityId);
        } else {
            // For folder, we need to find lists in the folder first
            // But Supabase JS client doesn't support subqueries in .eq() easily
            // So we'll fetch list IDs first
            const { data: lists } = await supabaseAdmin
                .from('lists_CAG_custom')
                .select('id')
                .eq('folder_id', entityId);

            const listIds = lists?.map(l => l.id) || [];
            if (listIds.length > 0) {
                query = query.in('list_id', listIds);
            } else {
                // No lists in folder, return empty context
                query = query.eq('list_id', '00000000-0000-0000-0000-000000000000');
            }
        }

        const { data: tasks } = await query.limit(1000);

        const statuses = [...new Set(tasks?.map((t) => t.status).filter(Boolean) || [])].join(', ') || 'None';
        const uniqueTaskNames = [...new Set(tasks?.map((t) => t.name).filter(Boolean) || [])].slice(0, 50).join(', ') || 'None';

        const contextPrompt = `
CONTEXT:
- Scope: ${scope.toUpperCase()}
- Valid Status Values: [${statuses}]
- Sample Task Names: [${uniqueTaskNames}]
- Current Time: ${new Date().toISOString()}

INSTRUCTIONS FOR ENTITY RESOLUTION:
- If the user mentions a status that is slightly different (e.g., "todo" vs "To Do"), map it to the closest valid status from the context.
- Use ILIKE for flexible matching (e.g., status ILIKE '%To Do%').
- For priority, common values are: urgent, high, normal, low
- For task names: ALWAYS use ILIKE for case-insensitive matching (e.g., name ILIKE '%QA Testing%' will match "QA Testing", "qa testing", "Qa Testing", etc.)
- When user asks about a specific task by name, match it using ILIKE with wildcards: name ILIKE '%task_name%'
- Handle partial matches: "QA" should match "QA Testing", "QA Review", etc.
`;

        // Format history for OpenAI
        const recentHistory = history.slice(-6).map(msg => ({
            role: msg.role,
            content: msg.role === 'assistant' && msg.sql
                ? `${msg.content}\n\n[System Note: The above response was generated using this SQL: ${msg.sql}]`
                : msg.content
        }));

        // Wait for rate limit slots before making API call
        await openaiRateLimiter.waitForSlot('openai-api');
        await openaiSecondRateLimiter.waitForSlot('openai-api-second');

        // Make API call with retry logic for rate limits
        const response = await retryOpenAICall(async () => {
            return await openai.chat.completions.create({
                model: 'gpt-4o',
                messages: [
                    { role: 'system', content: SYSTEM_PROMPT + contextPrompt },
                    ...recentHistory,
                    {
                        role: 'user',
                        content: `Generate a SQL query for this question: "${question}"\n\nRemember: The query MUST include the correct scoping clause for ${scope} scope.`,
                    },
                ],
                temperature: 0.1,
            });
        });

        let sql = response.choices[0]?.message?.content?.trim() || '';

        // Clean up SQL
        sql = sql.replace(/^```[\w]*\n?/i, '').replace(/\n?```$/i, '').trim();
        const sqlMatch = sql.match(/```sql\s*([\s\S]*?)```/i) || sql.match(/```\s*([\s\S]*?)```/i);
        if (sqlMatch) {
            sql = sqlMatch[1].trim();
        }
        sql = sql.trim();

        if (!sql.toUpperCase().trim().startsWith('SELECT')) {
            const selectMatch = sql.match(/(SELECT[\s\S]*?)(?:\n\n|$)/i);
            if (selectMatch) {
                sql = selectMatch[1].trim();
            } else {
                const selectIndex = sql.toUpperCase().indexOf('SELECT');
                if (selectIndex !== -1) {
                    sql = sql.substring(selectIndex).trim();
                }
            }
        }

        const semicolonIndex = sql.indexOf(';');
        if (semicolonIndex !== -1) {
            sql = sql.substring(0, semicolonIndex + 1).trim();
        }
        sql = sql.replace(/;+$/, '').trim();

        // Validate the generated SQL
        try {
            validateSQL(sql, entityId, scope);
        } catch (error) {
            console.error('SQL validation failed. Generated SQL:', sql);
            console.error('SQL (upper):', sql.toUpperCase());
            throw error;
        }

        // Get explanation
        const explanationResponse = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                {
                    role: 'system',
                    content: 'Explain the following SQL query in simple, human-readable terms.',
                },
                { role: 'user', content: sql },
            ],
            temperature: 0.3,
        });

        const explanation =
            explanationResponse.choices[0]?.message?.content?.trim() || '';

        return { sql, explanation };
    } catch (error) {
        console.error('SQL generation error:', error);
        throw error;
    }
}

/**
 * Validate SQL query against guardrails
 */
export function validateSQL(sql: string, entityId: string, scope: 'list' | 'folder'): void {
    const sqlUpper = sql.toUpperCase();

    // First, ensure this is a SELECT query
    // Remove comments and string literals to avoid false positives
    let sqlForValidation = sql;

    // Remove single-line comments
    sqlForValidation = sqlForValidation.replace(/--.*$/gm, '');
    // Remove multi-line comments
    sqlForValidation = sqlForValidation.replace(/\/\*[\s\S]*?\*\//g, '');
    // Remove string literals (both single and double quotes)
    sqlForValidation = sqlForValidation.replace(/'[^']*'/g, "''");
    sqlForValidation = sqlForValidation.replace(/"([^"]*)"/g, '""');

    const sqlUpperForValidation = sqlForValidation.toUpperCase();

    // Check for mutation operations
    // Only flag if the mutation keyword appears as a statement (not in column names or strings)
    // Use uppercase version for case-insensitive matching
    const mutationKeywords = [
        { keyword: 'INSERT', pattern: /(^|\s|;)\s*INSERT\s+INTO/ },
        { keyword: 'UPDATE', pattern: /(^|\s|;)\s*UPDATE\s+[A-Z_][A-Z0-9_]*\s+SET/ }, // UPDATE table SET (actual UPDATE statement)
        { keyword: 'DELETE', pattern: /(^|\s|;)\s*DELETE\s+FROM/ },
        { keyword: 'DROP', pattern: /(^|\s|;)\s*DROP\s+(TABLE|DATABASE|INDEX|VIEW)/ },
        { keyword: 'ALTER', pattern: /(^|\s|;)\s*ALTER\s+(TABLE|DATABASE|INDEX)/ },
        { keyword: 'TRUNCATE', pattern: /(^|\s|;)\s*TRUNCATE\s+TABLE/ },
        { keyword: 'CREATE', pattern: /(^|\s|;)\s*CREATE\s+(TABLE|DATABASE|INDEX|VIEW)/ },
        { keyword: 'GRANT', pattern: /(^|\s|;)\s*GRANT\b/ },
        { keyword: 'REVOKE', pattern: /(^|\s|;)\s*REVOKE\b/ },
    ];

    for (const { keyword, pattern } of mutationKeywords) {
        if (pattern.test(sqlUpperForValidation)) {
            throw new Error(
                `SQL query contains forbidden operation: ${keyword}. Only SELECT queries are allowed.`
            );
        }
    }

    // Check for scoping filter
    if (scope === 'list') {
        if (!sql.includes('list_id = $1')) {
            throw new Error(
                'SQL query must include "WHERE list_id = $1" to scope to the selected list'
            );
        }
    } else {
        // Folder scope validation
        // Check for: list_id IN (SELECT id FROM lists_CAG_custom WHERE folder_id = $1)
        // Or variations, but strict check is safer
        if (!sqlUpper.includes('WHERE FOLDER_ID = $1') && !sqlUpper.includes('WHERE LISTS_CAG_CUSTOM.FOLDER_ID = $1')) {
            // This is a bit loose, but checking for exact subquery string is fragile due to whitespace
            // Let's check for the key components
            if (!sqlUpper.includes('lists_CAG_custom'.toUpperCase()) || !sqlUpper.includes('folder_id'.toUpperCase())) {
                throw new Error(
                    'SQL query must include folder scoping: "WHERE list_id IN (SELECT id FROM lists_CAG_custom WHERE folder_id = $1)"'
                );
            }
        }
    }

    // Check for LIMIT clause
    if (!sqlUpper.includes('LIMIT')) {
        throw new Error('SQL query must include a LIMIT clause');
    }

    // Extract LIMIT value and validate
    const limitMatch = sql.match(/LIMIT\s+(\d+)/i);
    if (limitMatch) {
        const limit = parseInt(limitMatch[1], 10);
        if (limit > 1000) {
            throw new Error('LIMIT cannot exceed 1000 rows');
        }
    }

    // Additional validation: ensure SELECT is present
    // Check if SELECT appears anywhere in the query (not just at start, in case of whitespace)
    if (!sqlUpper.includes('SELECT')) {
        throw new Error('Query must contain SELECT statement');
    }

    // If it doesn't start with SELECT, try to find and extract the SELECT statement
    if (!sqlUpper.trim().startsWith('SELECT')) {
        const selectMatch = sql.match(/SELECT[\s\S]*/i);
        if (selectMatch) {
            // This will be handled by the caller, but we'll allow it here
            console.warn('SQL query does not start with SELECT, but contains SELECT statement');
        }
    }
}
