import OpenAI from 'openai';
import { supabaseAdmin } from '../supabase/client';
import { openaiRateLimiter, openaiSecondRateLimiter } from '../services/rate-limiter';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY || 'sk-placeholder',
});

export interface IntentResult {
    intent: string;
    is_vague: boolean;
    refers_to_previous: boolean;
    missing_information: string[];
    confidence: number;
}

export interface ChatState {
    currentTime?: string;
    [key: string]: any;
}

/**
 * Check if the input is likely an explicit SQL query
 */
export function isExplicitSQLQuery(text: string): boolean {
    const trimmed = text.trim().toUpperCase();
    return (
        trimmed.startsWith('SELECT ') ||
        trimmed.startsWith('INSERT ') ||
        trimmed.startsWith('UPDATE ') ||
        trimmed.startsWith('DELETE ') ||
        trimmed.startsWith('CREATE ') ||
        trimmed.startsWith('DROP ')
    );
}

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
- parent_task_id (TEXT, nullable) - ClickUp parent task ID for subtasks
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

Table: "task_due_date_history"
- id (UUID, primary key)
- task_id (UUID, foreign key to tasks_CAG_custom.id)
- clickup_task_id (TEXT)
- old_due_date (TIMESTAMPTZ, nullable) - Previous due date (null if first time setting)
- new_due_date (TIMESTAMPTZ, nullable) - New due date (null if removed)
- changed_at (TIMESTAMPTZ) - When the change happened
- changed_by (JSONB, nullable) - User who made the change

IMPORTANT: The updated_at field is automatically updated on any task modification and is indexed for efficient time-based queries.
`;

const SYSTEM_PROMPT = `You are a senior Context Augmented Generation (CAG) engineer for a ClickUp Intelligence database. Your mission is to generate high-performance SQL queries that adhere to the 8 CAG CORE PRINCIPLES.

=== CAG CORE PRINCIPLES ===
1. INSTRUCTION FOLLOWING: Strictly follow SQL guardrails and data privacy rules.
2. FACTUAL ACCURACY: Use ONLY the provided schema. Never invent columns or tables.
3. RELEVANCE: Generate queries that precisely target the user's intent. Filter aggressively.
4. COMPLETENESS: Include all necessary fields for a rich response (name, url, recent activity, assignees).
5. WRITING STYLE & TONE: Maintain a professional, ClickUp-savvy assistant voice in your logic.
6. COLLABORATIVELY: Prioritize team data like assignees and comment activity for better insights.
7. CONTEXT AWARENESS: Deeply leverage conversation history to resolve pronouns and incremental filters.
8. SAFETY: Always enforce list/folder scoping ($1) and never perform mutation operations.

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
   - COMMENTS/ACTIVITY: comments, discussions, user activity, recent changes (use "comments_CAG_custom" with JOIN or "task_due_date_history")
   - LISTS: list info, space, folder (use "lists_CAG_custom")

3. FILTER KEYWORDS - Extract filtering criteria:
   - Person names: "ian", "john", "mary" → Filter by assignees/watchers
   - Status words: "complete", "done", "in progress", "open", "todo" → Filter by status
   - Priority words: "urgent", "high", "normal", "low" → Filter by priority
   - Time words: "overdue", "due today", "this week", "last 7 days" → Filter by dates
   - Tag names: Any word that could be a tag → Filter by tags

4. EXPECTED RESPONSE COLUMNS - What does the user expect to see?
   - Always include: name, url (for clickable links)
   - For assignee questions: include assignees AND due_date columns
   - ALWAYS include due_date (formatted) whenever possible for completeness
   - For status questions: include status
   - For priority questions: include priority
   - For time/update questions: include updated_at, created_at

=== STEP 2: COLUMN SELECTION GUIDE ===

Based on the query type, select ONLY relevant columns to give focused answers:

| User Asks About | Required Columns |
|-----------------|------------------|
| Tasks in general | name, url, status, due_date (formatted) |
| Assignees/who | name, url, assignees, due_date (formatted), status |
| Due dates/deadlines | name, url, due_date (formatted), status |
| Overdue tasks | name, url, due_date (formatted), status, assignees |
| Status/progress | name, url, status, status_type |
| Priority | name, url, priority, status |
| Recently updated | name, url, TO_CHAR(updated_at, 'Month DD, YYYY, HH12:MI AM TZ') as updated_at, status |
| Completed/Done | name, url, TO_CHAR(date_closed, 'Month DD, YYYY, HH12:MI AM TZ') as date_closed, status |
| Created tasks | name, url, TO_CHAR(created_at, 'Month DD, YYYY, HH12:MI AM TZ') as created_at, creator |
| Tags | name, url, tags |
| Comments/Activity | t.name, t.url, c.comment_text, c."user", TO_CHAR(c."date", 'Month DD, YYYY, HH12:MI AM TZ') as comment_date (requires LEFT JOIN "comments_CAG_custom" c ON t.id = c.task_id) |
| Task History | t.name, t.url, TO_CHAR(h.old_due_date, 'Month DD, YYYY, HH12:MI AM TZ') as old_date, TO_CHAR(h.new_due_date, 'Month DD, YYYY, HH12:MI AM TZ') as new_date (requires JOIN "task_due_date_history" h ON t.id = h.task_id) |
| Time tracking | name, url, time_spent, time_estimate |
| Counts | COUNT(*) with appropriate alias |
| Complete Summary | t.name, t.url, t.description, t.status, t.assignees, t.priority, (SELECT json_agg(s.name) FROM "tasks_CAG_custom" s WHERE s.parent_task_id = t.clickup_task_id) as subtasks, c.comment_text, c."user", TO_CHAR(c."date", 'Month DD, YYYY, HH12:MI AM TZ') as comment_date (requires LEFT JOIN "comments_CAG_custom" c ON t.id = c.task_id) |

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
| "deadline changed" | Tasks with due date changes | JOIN "task_due_date_history" h ON t.id = h.task_id |
| "date changed X times" | Tasks with multiple changes | JOIN "task_due_date_history" h ON t.id = h.task_id |
| "rescheduled tasks" | Tasks with due date changes | JOIN "task_due_date_history" h ON t.id = h.task_id |
| "activity" / "recent activity" | Latest comments or updates | LEFT JOIN "comments_CAG_custom" c ON t.id = c.task_id |
| "what happened" | Latest comments and updates | LEFT JOIN "comments_CAG_custom" c ON t.id = c.task_id |
| "who commented" | Users who left comments | JOIN "comments_CAG_custom" c ON t.id = c.task_id |
| "completed today/this week" | Completed tasks in timeframe | status_type = 'closed' AND date_closed >= [TIMEFRAME_START] |

CRITICAL: OVERDUE/MISSED DEADLINE LOGIC
- When user asks about "overdue", "missed deadline", "late", or "past due" tasks:
  - ALWAYS include: status_type != 'closed' (to exclude completed tasks)
  - The user wants tasks that should have been done but are STILL PENDING
  - A task is overdue ONLY IF: due_date < NOW() AND it is NOT complete
  - Example: If due_date was Jan 5 but it's now Jan 20 and task is still open = OVERDUE
  - If task was due Jan 5 but completed on Jan 6, it is NOT overdue (it's done)

CRITICAL: DUE DATE CHANGE HISTORY QUERIES
- When user asks about "deadline changed", "date changed", "rescheduled", or "postponed" tasks:
  - JOIN "task_due_date_history" h ON t.id = h.task_id
  - Use COUNT(h.id) to count number of changes
  - Use GROUP BY t.id to aggregate per task
  - Use HAVING COUNT(h.id) > X to filter by number of changes

CRITICAL: COMPLETION LOGIC (FACTUAL ACCURACY)
- When user asks for "completed", "done", or "closed" tasks within a time range (e.g., "today", "this week"):
  - ALWAYS use the "date_closed" column for filtering, NOT "updated_at".
  - ALWAYS include "date_closed" in the SELECT list so the user can see when it was finished.
  - A task is completed in a timeframe ONLY IF its "date_closed" is within that range.
  - Example "completed this week": SELECT name, url, TO_CHAR(date_closed, '...') as date_closed FROM ... WHERE status_type = 'closed' AND date_closed >= DATE_TRUNC('week', NOW())

===STEP 4: CONTEXT CONTINUITY (CRITICAL FOR FOLLOW-UPS) ===

**UNDERSTANDING CONVERSATION CONTEXT:**

When a user asks a follow-up question, you MUST maintain context from previous queries. There are THREE types of follow-ups:

**TYPE 1: CLARIFICATION ANSWERS**
User provides a value that was requested in a clarification question.

Pattern Recognition:
- Previous assistant message was a QUESTION (e.g., "What timeframe would you like?")
- Current user message is a SHORT ANSWER (e.g., "7 days", "last week", "Ian")
- NO SQL in previous assistant message

Action:
1. Look back 2-3 messages to find the ORIGINAL user request (before the clarification)
2. Take the ORIGINAL intent (e.g., "show me recent tasks")
3. Apply the NEW filter from the answer (e.g., "7 days")
4. Generate SQL that fulfills: ORIGINAL_REQUEST + NEW_FILTER

Example:

User: "show me recent tasks"
Assistant: "I'd be happy to show you recent tasks! What timeframe would you like - last 24 hours, last 7 days, or last 30 days?"
User: "7 days"
Generated SQL: SELECT name, url, status, TO_CHAR(updated_at, 'Month DD, YYYY, HH12:MI AM TZ') as updated_at 
       FROM "tasks_CAG_custom" 
       WHERE list_id = $1 AND updated_at > NOW() - INTERVAL '7 days'
       ORDER BY updated_at DESC LIMIT 100

**TYPE 2: INCREMENTAL REFINEMENT**
User adds filters to narrow down previous results using pronouns or filter phrases.

Pattern Recognition:
- Previous assistant message HAS SQL
- Current user message contains: "them", "those", "these", "only", "just", "filter by", "narrow down"
- User is REFINING, not starting fresh

Action:
1. Extract ALL WHERE clauses from the previous SQL
2. Keep the base filters (list_id, folder_id, etc.)
3. ADD the new filter as an additional AND condition
4. Preserve ORDER BY and LIMIT from previous query

Example:

Previous SQL: WHERE list_id = $1 AND status_type != 'closed'
User: "only those assigned to Ian"
Generated SQL: WHERE list_id = $1 AND status_type != 'closed'
       AND EXISTS(SELECT 1 FROM jsonb_array_elements(assignees) AS a
                   WHERE a ->> 'username' ILIKE '%ian%' OR a ->> 'email' ILIKE '%ian%')

**TYPE 3: PRONOUN REFERENCE**
User refers to previous results with pronouns but asks a NEW question about them.

Pattern Recognition:
- User says: "what about them?", "who's assigned to those?", "when are these due?"
- Previous SQL exists
- User wants DIFFERENT information about the SAME set of results

Action:
1. Keep the WHERE clause from previous SQL (this defines "them"/"those"/"these")
2. Change the SELECT columns based on the new question
3. Adjust ORDER BY if needed for the new question

Example:

Previous SQL: SELECT name, url, status FROM "tasks_CAG_custom" WHERE list_id = $1 AND status = 'In Progress'
User: "when are those due?"
Generated SQL: SELECT name, url, TO_CHAR(due_date, 'Month DD, YYYY, HH12:MI AM TZ') as due_date, status
       FROM "tasks_CAG_custom" 
       WHERE list_id = $1 AND status = 'In Progress'
       ORDER BY due_date ASC LIMIT 100


**CONTEXT RESET SIGNALS:**
Drop previous context if user says:
- "now show me..." (explicit topic change)
- "what about [NEW_TOPIC]" (different entity)
- "forget that, ..." (explicit reset)
- Asks about a completely different entity (e.g., was asking about tasks, now asks about comments)

**CRITICAL RULES:**
1. ALWAYS check conversation history for context
2. For clarification answers, combine ORIGINAL_REQUEST + NEW_FILTER
3. For refinements, ADD filters with AND, don't replace
4. For pronoun references, keep WHERE clause, change SELECT
5. Preserve scoping (list_id or folder_id) across all follow-ups
6. When in doubt, err on the side of maintaining context

=== MANDATORY GUARDRAILS ===

1. SCOPING (REQUIRED): 
   - List scope: WHERE list_id = $1
   - Folder scope: WHERE list_id IN (SELECT id FROM "lists_CAG_custom" WHERE folder_id = $1)
   - CRITICAL: tasks_CAG_custom does NOT have a folder_id column! NEVER use WHERE folder_id = $1 on tasks.

2. SUBTASK FILTERING (CRITICAL):
   - By default, EXCLUDE subtasks from task queries: AND parent_task_id IS NULL
   - Only include subtasks if the user explicitly asks for "subtasks", "child tasks", or "tasks and subtasks"
   - This prevents double-counting (e.g., "Ian's tasks" should return 14 parent tasks, not 111 tasks+subtasks)

3. LIMIT (REQUIRED): Always include LIMIT (default 100, max 1000)

4. SELECT ONLY: No INSERT, UPDATE, DELETE, DROP, ALTER, GRANT

4. TABLES: Only use "lists_CAG_custom", "tasks_CAG_custom", "comments_CAG_custom", "task_due_date_history"

5. CASE-SENSITIVE TABLE NAMES: Always use double quotes: "tasks_CAG_custom"

6. DATE FORMATTING: TO_CHAR(date_field, 'Month DD, YYYY, HH12:MI AM TZ')

7. JSONB SEARCH (CRITICAL):
   - For assignees: EXISTS (SELECT 1 FROM jsonb_array_elements(assignees) AS a WHERE a->>'username' ILIKE '%name%' OR a->>'email' ILIKE '%name%')
   - For tags: EXISTS (SELECT 1 FROM jsonb_array_elements(tags) AS t WHERE t->>'name' ILIKE '%tagname%')
   - NEVER use @> for name matching (it requires exact match)

8. NO SEMICOLONS (CRITICAL): NEVER include a semicolon (;) at the end of your SQL query. The query will be wrapped in a subquery for safety.

10. NAME/TEXT MATCHING: Always use ILIKE '%term%' for flexible matching
11. SUBQUERIES: Always ensure subqueries are complete (e.g., SELECT ... FROM ...) and correctly bracketed.
12. FOLLOW-UP QUESTIONS: Reuse WHERE conditions from previous query in chat history
13. COMPLETION DATES (CRITICAL): Always use "date_closed" for "completed/done" time-filters. NEVER use "updated_at" for this purpose.

=== EXAMPLES WITH INTENT ANALYSIS ===

Q: "task assign to ian"
→ Intent: FILTER tasks by assignee "ian"
→ Table: tasks_CAG_custom
→ Columns: name, url, assignees, due_date, status
→ Filter: EXISTS on assignees JSONB with ILIKE + exclude subtasks
SQL: SELECT name, url, assignees, TO_CHAR(due_date, 'Month DD, YYYY, HH12:MI AM TZ') as due_date, status FROM "tasks_CAG_custom" WHERE list_id = $1 AND parent_task_id IS NULL AND EXISTS (SELECT 1 FROM jsonb_array_elements(assignees) AS a WHERE a->>'username' ILIKE '%ian%' OR a->>'email' ILIKE '%ian%') LIMIT 100

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

Q: "tasks with deadline changes" or "tasks where due date was changed"
→ Intent: LIST tasks that have had their due date modified at least once
→ Tables: tasks_CAG_custom, task_due_date_history
→ Columns: name, url, due_date, status, count of changes
→ Filter: JOIN with history table and count
SQL: SELECT t.name, t.url, TO_CHAR(t.due_date, 'Month DD, YYYY, HH12:MI AM TZ') as due_date, t.status, COUNT(h.id) as times_rescheduled FROM "tasks_CAG_custom" t JOIN "task_due_date_history" h ON t.id = h.task_id WHERE t.list_id = $1 GROUP BY t.id, t.name, t.url, t.due_date, t.status ORDER BY times_rescheduled DESC LIMIT 100

Q: "tasks where deadline was changed more than 3 times"
→ Intent: LIST tasks with multiple deadline changes (rescheduled frequently)
→ Tables: tasks_CAG_custom, task_due_date_history
→ Columns: name, url, due_date, status, change count
→ Filter: JOIN + GROUP BY + HAVING COUNT > 3
SQL: SELECT t.name, t.url, TO_CHAR(t.due_date, 'Month DD, YYYY, HH12:MI AM TZ') as due_date, t.status, COUNT(h.id) as times_rescheduled FROM "tasks_CAG_custom" t JOIN "task_due_date_history" h ON t.id = h.task_id WHERE t.list_id = $1 GROUP BY t.id, t.name, t.url, t.due_date, t.status HAVING COUNT(h.id) > 3 ORDER BY times_rescheduled DESC LIMIT 100

Q: "show me rescheduled tasks"
→ Intent: Same as deadline changed - tasks that have been postponed
→ Tables: tasks_CAG_custom, task_due_date_history
→ Columns: name, url, due_date, status, change count
SQL: SELECT t.name, t.url, TO_CHAR(t.due_date, 'Month DD, YYYY, HH12:MI AM TZ') as due_date, t.status, COUNT(h.id) as times_rescheduled FROM "tasks_CAG_custom" t JOIN "task_due_date_history" h ON t.id = h.task_id WHERE t.list_id = $1 GROUP BY t.id, t.name, t.url, t.due_date, t.status ORDER BY times_rescheduled DESC LIMIT 100

Your response should be ONLY the SQL query, nothing else. Do not include your analysis, explanations, markdown formatting, or any other text.`;

export async function generateSQL(
    question: string,
    boardId: string,
    history: Array<{ role: 'user' | 'assistant'; content: string; sql?: string; intent?: string }> = [],
    scope: 'list' | 'folder' = 'list',
    intentResult?: IntentResult,
    state?: ChatState & { followUpSql?: string; previousClarification?: string }
): Promise<{ sql: string; explanation: string; intent?: string }> {
    try {
        // Check if user provided an explicit SQL query
        if (isExplicitSQLQuery(question)) {
            // Validate the explicit SQL query
            validateSQL(question, boardId, scope);

            // Get explanation for the explicit query
            const explanationResponse = await retryOpenAICall(async () => {
                return await openai.chat.completions.create({
                    model: 'gpt-4o-mini',
                    messages: [
                        {
                            role: 'system',
                            content: 'Explain the following SQL query in simple, human-readable terms.',
                        },
                        { role: 'user', content: question },
                    ],
                    temperature: 0.3,
                });
            });

            const explanation =
                explanationResponse.choices[0]?.message?.content?.trim() ||
                'Executing the provided SQL query.';

            return { sql: question.trim(), explanation, intent: 'EXPLICIT_SQL' };
        }

        // 1. Fetch context (status values from tasks)
        // Adjust query based on scope
        let query = supabaseAdmin
            .from('tasks_CAG_custom')
            .select('status, name');

        if (scope === 'list') {
            query = query.eq('list_id', boardId);
        } else {
            const { data: lists } = await supabaseAdmin
                .from('lists_CAG_custom')
                .select('id')
                .eq('folder_id', boardId);

            const listIds = lists?.map((l: any) => l.id) || [];
            if (listIds.length > 0) {
                query = query.in('list_id', listIds);
            } else {
                query = query.eq('list_id', '00000000-0000-0000-0000-000000000000');
            }
        }

        const { data: tasks } = await query.limit(1000);

        const statuses = [...new Set(tasks?.map((t: any) => t.status).filter(Boolean) || [])].join(', ') || 'None';
        const uniqueTaskNames = [...new Set(tasks?.map((t: any) => t.name).filter(Boolean) || [])].slice(0, 50).join(', ') || 'None';

        const contextPrompt = `
CONTEXT:
- Scope: ${scope.toUpperCase()}
${scope === 'folder'
                ? '- CRITICAL: You MUST use folder scoping: WHERE list_id IN (SELECT id FROM "lists_CAG_custom" WHERE folder_id = $1)'
                : '- CRITICAL: You MUST use list scoping: WHERE list_id = $1'
            }
- Valid Status Values: [${statuses}]
    - Sample Task Names: [${uniqueTaskNames}]
        - Current Time: ${new Date().toISOString()}
`;

        // Format history for OpenAI
        const recentHistory = history.slice(-3).map((msg: any) => {
            if (msg.role === 'assistant' && msg.sql) {
                return {
                    role: msg.role,
                    content: `Response: ${msg.content}\n\nSQL Query Used: ${msg.sql}${msg.intent ? `\nIntent: ${msg.intent}` : ''}`
                };
            }
            return {
                role: msg.role,
                content: msg.content
            };
        });

        // Add Intent Metadata to the prompt
        let intentMetadata = '';
        if (intentResult) {
            intentMetadata = `
INTENT METADATA:
- Classified Intent: ${intentResult.intent}
- Is Vague: ${intentResult.is_vague}
- Refers to Previous: ${intentResult.refers_to_previous}
- Missing Info: ${intentResult.missing_information.join(', ') || 'None'}
- Confidence: ${intentResult.confidence}
`;
        }

        if (state?.previousClarification) {
            intentMetadata += `\n- Previous Clarification Asked: ${state.previousClarification}`;
        }

        if (state?.followUpSql) {
            intentMetadata += `\n- Proposed Follow-up SQL (use as reference): ${state.followUpSql}`;
        }

        const currentTime = state?.currentTime || new Date().toISOString();
        intentMetadata += `\n- Current Universal Time: ${currentTime}`;
        intentMetadata += `\n- DATE FILTER HINT: For "overdue", use updated_at or due_date < '${currentTime}' and status_type != 'closed'. For "recent", just order by updated_at DESC.`;

        // Wait for rate limit slots before making API call
        await openaiRateLimiter.waitForSlot('openai-api');
        await openaiSecondRateLimiter.waitForSlot('openai-api-second');

        const response = await retryOpenAICall(async () => {
            const isFollowUp = intentResult?.intent === 'FOLLOW_UP' || intentResult?.refers_to_previous === true;
            const contextMessage = isFollowUp
                ? `This is a FOLLOW-UP or ANSWER to clarification: "${question}"

CLARIFICATION ANALYSIS:
1. Look at history: If the last assistant message was a question, then the current message is the ANSWER.
2. If it's an answer: Find the user request BEFORE that question.
3. Combine them: Create a SQL query that fulfills the ORIGINAL request using the NEW filter from the answer.`
                : `Generate a SQL query for this question: "${question}"`;

            return await openai.chat.completions.create({
                model: 'gpt-4o',
                messages: [
                    { role: 'system', content: SYSTEM_PROMPT + contextPrompt + intentMetadata },
                    ...recentHistory as any,
                    {
                        role: 'user',
                        content: `${contextMessage}

CRITICAL: INTENT ANALYSIS - Think step by step:
1. ANALYZE USER INTENT: What is the user really asking?
   - Are they asking about ACTIVE tasks (overdue, upcoming, in progress, pending)?
   - Are they asking about RECENT ACTIVITY (recent, latest, what happened lately)?
   - Are they asking about COMPLETED tasks (done, finished, closed)?

2. For broad task discovery (e.g., "Ian's tasks", "tasks for Website redesign"):
   - DO NOT automatically filter by status_type or due_date. 
   - Return ALL matching tasks (open and closed, with and without dates) to ensure Factual Accuracy.
   - ONLY add "AND status_type != 'closed'" if the user explicitly mentions "active", "pending", "incomplete", or "current".

3. For specific ACTIVE task queries (overdue, upcoming, in progress, pending, current, due soon, ongoing):
   - SHOULD exclude closed tasks (AND status_type != 'closed').
   - For "ongoing" specifically: filter by active status types.

3. For RECENT ACTIVITY queries (recent, latest, what happened):
   - DO NOT filter by status_type. Show all tasks (open and closed) ordered by updated_at DESC.
   - If no time window is provided, just LIMIT to 10-20 most recent.

4. For COMPLETED task queries:
   - Add: AND status_type = 'closed'

5. SUBTASK EXCLUSION (MANDATORY):
   - ALWAYS add: AND parent_task_id IS NULL
   - This excludes subtasks from results (prevents double-counting)
   - ONLY skip this filter if user explicitly asks for "subtasks" or "child tasks"

6. Table selection: Use "tasks_CAG_custom" for task queries.
7. Scoping: MUST include list_id = $1 or folder_id = $1 check.
8. Fields: ALWAYS include name, url, status, and due_date. 
   - CRITICAL: If the user asks for a "summary", "details", "full overview", or "activity", you MUST include:
     - t.description
     - Subtasks via subquery: (SELECT json_agg(s.name) FROM "tasks_CAG_custom" s WHERE s.parent_task_id = t.clickup_task_id) as subtasks
     - LEFT JOIN "comments_CAG_custom" c ON t.id = c.task_id and select c.comment_text, c."user", c."date" as comment_date
`,
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
            validateSQL(sql, boardId, scope);
        } catch (error) {
            console.error('SQL validation failed. Generated SQL:', sql);
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

        return { sql, explanation, intent: intentResult?.intent };
    } catch (error) {
        console.error('SQL generation error:', error);
        throw error;
    }
}

/**
 * Validate SQL query against guardrails
 */
export function validateSQL(sql: string, boardId: string, scope: 'list' | 'folder'): void {
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
        // The key pattern is: list_id IN (...) with folder_id = $1 somewhere in the subquery
        const hasListIdIn = sqlUpper.includes('LIST_ID IN');
        const hasFolderId = sqlUpper.includes('FOLDER_ID');
        const hasListsTable = sqlUpper.includes('LISTS_CAG_CUSTOM') || sqlUpper.includes('"LISTS_CAG_CUSTOM"');

        if (!hasListIdIn || !hasFolderId || !hasListsTable) {
            throw new Error(
                'SQL query must include folder scoping: "WHERE list_id IN (SELECT id FROM lists_CAG_custom WHERE folder_id = $1)"'
            );
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

