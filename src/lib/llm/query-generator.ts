import OpenAI from 'openai';
import { supabaseAdmin } from '../supabase/client';
import { openaiRateLimiter, openaiSecondRateLimiter } from '../services/rate-limiter';

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

const SYSTEM_PROMPT = `You are an intelligent SQL query generator for a ClickUp project management database. Your job is to ANALYZE user intent first, then generate accurate PostgreSQL queries.

${DATABASE_SCHEMA}

=== STEP 1: INTENT ANALYSIS (Do this FIRST before generating SQL) ===

Before writing any SQL, you MUST mentally analyze the user's question:

1. QUERY TYPE - What does the user want?
   - LIST: "show me", "list", "what are", "get all" → User wants a list of items
   - COUNT: "how many", "count", "total number" → User wants a count/aggregate
   - DETAILS: "what is the...", "tell me about" → User wants specific details
   - FILTER: "assigned to", "with tag", "overdue", "high priority" → User wants filtered results
   - SEARCH: mentions a name, status, or keyword → User is searching for something specific

2. ENTITY FOCUS - What is the user asking about?
   - TASKS: task names, status, priority, due dates, assignees (use "tasks_CAG_custom")
   - COMMENTS: comments, discussions, resolved comments (use "comments_CAG_custom" with JOIN)
   - LISTS: list info, space, folder (use "lists_CAG_custom")

3. FILTER KEYWORDS - Extract filtering criteria:
   - Person names: "ian", "john", "mary" → Filter by assignees/watchers
   - Status words: "complete", "done", "in progress", "open", "todo" → Filter by status
   - Priority words: "urgent", "high", "normal", "low" → Filter by priority
   - Time words: "overdue", "due today", "this week", "last 7 days" → Filter by dates
   - Tag names: Any word that could be a tag → Filter by tags

4. EXPECTED RESPONSE COLUMNS - What does the user expect to see?
   - Always include: name, url (for clickable links)
   - For assignee questions: include assignees column
   - For due date questions: include due_date (formatted)
   - For status questions: include status
   - For priority questions: include priority
   - For time/update questions: include updated_at, created_at

=== STEP 2: COLUMN SELECTION GUIDE ===

Based on the query type, select ONLY relevant columns to give focused answers:

| User Asks About | Required Columns |
|-----------------|------------------|
| Tasks in general | name, url, status |
| Assignees/who | name, url, assignees |
| Due dates/deadlines | name, url, due_date (formatted), status |
| Overdue tasks | name, url, due_date (formatted), status, assignees |
| Status/progress | name, url, status, status_type |
| Priority | name, url, priority, status |
| Recently updated | name, url, updated_at (formatted), status |
| Created tasks | name, url, created_at (formatted), creator |
| Tags | name, url, tags |
| Comments | comment_text, task name (via JOIN), user, date |
| Time tracking | name, url, time_spent, time_estimate |
| Counts | COUNT(*) with appropriate alias |

=== STEP 3: SMART KEYWORD INTERPRETATION ===

Understand what users MEAN, not just what they SAY:

| User Says | They Mean | SQL Filter |
|-----------|-----------|------------|
| "task assign to ian" | Tasks where ian is an assignee | EXISTS (SELECT 1 FROM jsonb_array_elements(assignees) AS a WHERE a->>'username' ILIKE '%ian%' OR a->>'email' ILIKE '%ian%') |
| "ian's tasks" | Tasks assigned to ian | Same as above |
| "who is working on X" | Assignees of task X | SELECT assignees WHERE name ILIKE '%X%' |
| "overdue tasks" | Tasks past due date AND still open | due_date < NOW() AND status_type != 'closed' |
| "missed deadline" | Tasks past due date AND still open | due_date < NOW() AND status_type != 'closed' |
| "late tasks" | Tasks past due date AND still open | due_date < NOW() AND status_type != 'closed' |
| "pending overdue" | Tasks past due date AND still open | due_date < NOW() AND status_type != 'closed' |
| "incomplete tasks" | Tasks not done | status_type != 'closed' |
| "done tasks" | Completed tasks | status_type = 'closed' OR status ILIKE '%complete%' OR status ILIKE '%done%' |
| "urgent" | High priority tasks | priority ILIKE '%urgent%' OR priority ILIKE '%high%' |
| "recent" / "latest" | Recently updated | ORDER BY updated_at DESC |
| "old" / "oldest" | Oldest tasks | ORDER BY created_at ASC |

CRITICAL: OVERDUE/MISSED DEADLINE LOGIC
- When user asks about "overdue", "missed deadline", "late", or "past due" tasks:
  - ALWAYS include: status_type != 'closed' (to exclude completed tasks)
  - The user wants tasks that should have been done but are STILL PENDING
  - A task is overdue ONLY IF: due_date < NOW() AND it is NOT complete
  - Example: If due_date was Jan 5 but it's now Jan 20 and task is still open = OVERDUE
  - If task was due Jan 5 but completed on Jan 6, it is NOT overdue (it's done)

=== MANDATORY GUARDRAILS ===

1. SCOPING (REQUIRED): 
   - List scope: WHERE list_id = $1
   - Folder scope: WHERE list_id IN (SELECT id FROM "lists_CAG_custom" WHERE folder_id = $1)

2. LIMIT (REQUIRED): Always include LIMIT (default 100, max 1000)

3. SELECT ONLY: No INSERT, UPDATE, DELETE, DROP, ALTER, GRANT

4. TABLES: Only use "lists_CAG_custom", "tasks_CAG_custom", "comments_CAG_custom"

5. CASE-SENSITIVE TABLE NAMES: Always use double quotes: "tasks_CAG_custom"

6. DATE FORMATTING: TO_CHAR(date_field, 'Month DD, YYYY, HH12:MI AM TZ')

7. JSONB SEARCH (CRITICAL):
   - For assignees: EXISTS (SELECT 1 FROM jsonb_array_elements(assignees) AS a WHERE a->>'username' ILIKE '%name%' OR a->>'email' ILIKE '%name%')
   - For tags: EXISTS (SELECT 1 FROM jsonb_array_elements(tags) AS t WHERE t->>'name' ILIKE '%tagname%')
   - NEVER use @> for name matching (it requires exact match)

8. NAME/TEXT MATCHING: Always use ILIKE '%term%' for flexible matching

9. FOLLOW-UP QUESTIONS: Reuse WHERE conditions from previous query in chat history

=== EXAMPLES WITH INTENT ANALYSIS ===

Q: "task assign to ian"
→ Intent: FILTER tasks by assignee "ian"
→ Table: tasks_CAG_custom
→ Columns: name, url, assignees, status
→ Filter: EXISTS on assignees JSONB with ILIKE
SQL: SELECT name, url, assignees, status FROM "tasks_CAG_custom" WHERE list_id = $1 AND EXISTS (SELECT 1 FROM jsonb_array_elements(assignees) AS a WHERE a->>'username' ILIKE '%ian%' OR a->>'email' ILIKE '%ian%') LIMIT 100

Q: "how many tasks are overdue"
→ Intent: COUNT with time filter
→ Table: tasks_CAG_custom  
→ Columns: COUNT(*)
→ Filter: due_date < NOW() AND status_type != 'closed'
SQL: SELECT COUNT(*) as overdue_count FROM "tasks_CAG_custom" WHERE list_id = $1 AND due_date < NOW() AND status_type != 'closed' LIMIT 100

Q: "what is the status of website redesign"
→ Intent: DETAILS about specific task
→ Table: tasks_CAG_custom
→ Columns: name, url, status, priority, assignees, due_date
→ Filter: name ILIKE '%website redesign%'
SQL: SELECT name, url, status, priority, assignees, TO_CHAR(due_date, 'Month DD, YYYY, HH12:MI AM TZ') as due_date FROM "tasks_CAG_custom" WHERE list_id = $1 AND name ILIKE '%website redesign%' LIMIT 100

Q: "show me high priority tasks due this week"
→ Intent: LIST with multiple filters
→ Table: tasks_CAG_custom
→ Columns: name, url, priority, due_date, status, assignees
→ Filter: priority filter + date range
SQL: SELECT name, url, priority, TO_CHAR(due_date, 'Month DD, YYYY, HH12:MI AM TZ') as due_date, status, assignees FROM "tasks_CAG_custom" WHERE list_id = $1 AND (priority ILIKE '%high%' OR priority ILIKE '%urgent%') AND due_date >= NOW() AND due_date < NOW() + INTERVAL '7 days' ORDER BY due_date LIMIT 100

Q: "who is assigned to the marketing campaign task"
→ Intent: DETAILS - get assignees of specific task
→ Table: tasks_CAG_custom
→ Columns: name, url, assignees
→ Filter: name ILIKE '%marketing campaign%'
SQL: SELECT name, url, assignees FROM "tasks_CAG_custom" WHERE list_id = $1 AND name ILIKE '%marketing campaign%' LIMIT 100

Q: "tell me all the tasks that missed their deadline"
→ Intent: LIST tasks that are OVERDUE and still PENDING (not complete)
→ Table: tasks_CAG_custom
→ Columns: name, url, due_date, status, assignees (so user knows who is responsible)
→ Filter: due_date < NOW() AND status_type != 'closed' (MUST exclude completed tasks!)
SQL: SELECT name, url, TO_CHAR(due_date, 'Month DD, YYYY, HH12:MI AM TZ') as due_date, status, assignees FROM "tasks_CAG_custom" WHERE list_id = $1 AND due_date < NOW() AND due_date IS NOT NULL AND status_type != 'closed' ORDER BY due_date ASC LIMIT 100

Q: "tasks that are late"
→ Intent: Same as missed deadline - OVERDUE and NOT complete
→ Table: tasks_CAG_custom
→ Columns: name, url, due_date, status, assignees
→ Filter: due_date < NOW() AND status_type != 'closed'
SQL: SELECT name, url, TO_CHAR(due_date, 'Month DD, YYYY, HH12:MI AM TZ') as due_date, status, assignees FROM "tasks_CAG_custom" WHERE list_id = $1 AND due_date < NOW() AND due_date IS NOT NULL AND status_type != 'closed' ORDER BY due_date ASC LIMIT 100

Your response should be ONLY the SQL query, nothing else. Do not include your analysis, explanations, markdown formatting, or any other text.`;

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
- If the user mentions a status that is slightly different(e.g., "todo" vs "To Do"), map it to the closest valid status from the context.
- Use ILIKE for flexible matching(e.g., status ILIKE '%To Do%').
- For priority, common values are: urgent, high, normal, low
    - For task names: ALWAYS use ILIKE for case -insensitive matching(e.g., name ILIKE '%QA Testing%' will match "QA Testing", "qa testing", "Qa Testing", etc.)
        - When user asks about a specific task by name, match it using ILIKE with wildcards: name ILIKE '%task_name%'
            - Handle partial matches: "QA" should match "QA Testing", "QA Review", etc.
`;

        // Format history for OpenAI
        const recentHistory = history.slice(-6).map(msg => ({
            role: msg.role,
            content: msg.role === 'assistant' && msg.sql
                ? `${msg.content} \n\n[System Note: The above response was generated using this SQL: ${msg.sql}]`
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
        sql = sql.replace(/^```[\w]*\n ? /i, '').replace(/\n ? ```$/i, '').trim();
        const sqlMatch = sql.match(/```sql\s * ([\s\S] *?)```/i) || sql.match(/```\s * ([\s\S] *?)```/i);
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
