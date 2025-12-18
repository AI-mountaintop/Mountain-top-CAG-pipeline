import OpenAI from 'openai';
import { supabaseAdmin } from '../supabase/client';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY || 'sk-placeholder',
});

const DATABASE_SCHEMA = `
DATABASE SCHEMA:

Table: boards
- id (UUID, primary key)
- trello_board_id (TEXT)
- name (TEXT)
- url (TEXT)
- description (TEXT)
- last_synced (TIMESTAMPTZ)
- created_at (TIMESTAMPTZ)
- updated_at (TIMESTAMPTZ)

Table: lists
- id (UUID, primary key)
- board_id (UUID, foreign key to boards.id)
- trello_list_id (TEXT)
- name (TEXT)
- position (DECIMAL)
- is_closed (BOOLEAN)
- created_at (TIMESTAMPTZ)
- updated_at (TIMESTAMPTZ)

Table: cards
- id (UUID, primary key)
- board_id (UUID, foreign key to boards.id)
- list_id (UUID, foreign key to lists.id, nullable)
- trello_card_id (TEXT)
- name (TEXT)
- description (TEXT)
- position (DECIMAL)
- due_date (TIMESTAMPTZ, nullable)
- due_complete (BOOLEAN)
- is_closed (BOOLEAN)
- labels (JSONB) - Array of objects: [{id: string, name: string, color: string}]
- members (JSONB) - Array of objects: [{id: string, username: string, fullName: string}]
- checklists (JSONB)
- attachments (JSONB)
- status (TEXT, nullable)
- url (TEXT)
- created_at (TIMESTAMPTZ)
- updated_at (TIMESTAMPTZ) - INDEXED for time-based queries

Table: comments
- id (UUID, primary key)
- card_id (UUID, foreign key to cards.id)
- trello_id (TEXT)
- text (TEXT)
- member_creator (JSONB) - {id, username, fullName, avatarUrl}
- date (TIMESTAMPTZ)
- type (TEXT)
- created_at (TIMESTAMPTZ)
- updated_at (TIMESTAMPTZ)

IMPORTANT: The updated_at field is automatically updated on any card modification and is indexed for efficient time-based queries.
`;

const SYSTEM_PROMPT = `You are a SQL query generator for a Trello board analytics database. Your job is to convert natural language questions into valid PostgreSQL queries.

${DATABASE_SCHEMA}

MANDATORY GUARDRAILS:
1. ALL queries MUST include "WHERE board_id = $1" (or "WHERE c.board_id = $1" if joining) to scope to the selected board
2. ALL queries MUST include a LIMIT clause (default 100, maximum 1000)
3. ONLY SELECT queries are allowed - NO INSERT, UPDATE, DELETE, DROP, ALTER, GRANT, or any mutation operations
4. DO NOT access tables other than boards, lists, cards, and comments
5. For time-based filters (e.g., "last 10 minutes", "today"), use the updated_at field with INTERVAL arithmetic
6. When querying JSONB fields (labels, members), use PostgreSQL JSONB operators like @>, ->, and ->>
7. Always use parameterized queries with $1 for board_id
8. To query comments, you MUST JOIN the cards table to filter by board_id (e.g., JOIN cards c ON comments.card_id = c.id WHERE c.board_id = $1)

CRITICAL: CONTEXT & FOLLOW-UP QUESTIONS
- The chat history contains the SQL queries used to generate previous answers.
- If the user asks a follow-up question (e.g., "who is assigned to them?", "what are the names of those tasks?"), YOU MUST REUSE the filters/conditions from the previous SQL query.
- DO NOT generate a random query. If the user refers to "those tasks", look at the previous SQL to see what "those tasks" were (e.g., if the previous query filtered by list_id, you must also filter by that list_id).
- If the user asks for specific details about the previously listed items, SELECT those details using the SAME WHERE clause as the previous query.

EXAMPLE QUERIES:

Q: "What cards are due this week?"
A: SELECT name, due_date, list_id FROM cards WHERE board_id = $1 AND due_date >= NOW() AND due_date < NOW() + INTERVAL '7 days' ORDER BY due_date LIMIT 100

Q: "Show me all cards in the 'In Progress' list"
A: SELECT c.name, c.description, c.due_date FROM cards c JOIN lists l ON c.list_id = l.id WHERE c.board_id = $1 AND l.name ILIKE '%in progress%' ORDER BY c.position LIMIT 100

Q: "What changed in the last 10 minutes?"
A: SELECT name, updated_at, description FROM cards WHERE board_id = $1 AND updated_at >= NOW() - INTERVAL '10 minutes' ORDER BY updated_at DESC LIMIT 100

Q: "Which cards have no due date?"
A: SELECT name, list_id FROM cards WHERE board_id = $1 AND due_date IS NULL AND is_closed = false LIMIT 100

Q: "Show me cards with the 'urgent' label"
A: SELECT name, labels, due_date FROM cards WHERE board_id = $1 AND labels @> '[{"name": "urgent"}]'::jsonb LIMIT 100

Q: "Show me recent comments"
A: SELECT cm.text, cm.date, c.name as card_name, cm.member_creator->>'fullName' as author FROM comments cm JOIN cards c ON cm.card_id = c.id WHERE c.board_id = $1 ORDER BY cm.date DESC LIMIT 50

Your response should be ONLY the SQL query, nothing else. Do not include explanations, markdown formatting, or any other text.`;

export async function generateSQL(
    question: string,
    boardId: string,
    history: Array<{ role: 'user' | 'assistant'; content: string; sql?: string }> = []
): Promise<{ sql: string; explanation: string }> {
    try {
        // 1. Fetch context (list names)
        const { data: lists } = await supabaseAdmin
            .from('lists')
            .select('name')
            .eq('board_id', boardId);

        const listNames = lists?.map((l) => l.name).join(', ') || 'None';

        const contextPrompt = `
CONTEXT:
- Valid List Names for this board: [${listNames}]
- Current Time: ${new Date().toISOString()}

INSTRUCTIONS FOR ENTITY RESOLUTION:
- If the user mentions a list name that is slightly different (e.g., "todo" vs "To Do"), map it to the closest valid list name from the context.
- Use ILIKE for flexible matching (e.g., name ILIKE '%To Do%').
`;

        // Format history for OpenAI
        // We include the SQL of previous assistant messages to provide context for follow-up questions
        const recentHistory = history.slice(-6).map(msg => ({
            role: msg.role,
            content: msg.role === 'assistant' && msg.sql
                ? `${msg.content}\n\n[System Note: The above response was generated using this SQL: ${msg.sql}]`
                : msg.content
        }));

        const response = await openai.chat.completions.create({
            model: 'gpt-4o', // Upgraded to gpt-4o for better context handling
            messages: [
                { role: 'system', content: SYSTEM_PROMPT + contextPrompt },
                ...recentHistory,
                {
                    role: 'user',
                    content: `Generate a SQL query for this question: "${question}"\n\nRemember: The query MUST include WHERE board_id = $1 and a LIMIT clause.`,
                },
            ],
            temperature: 0.1, // Low temperature for consistency
        });

        const sql = response.choices[0]?.message?.content?.trim() || '';

        // Validate the generated SQL
        validateSQL(sql, boardId);

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
export function validateSQL(sql: string, boardId: string): void {
    const sqlUpper = sql.toUpperCase();

    // Check for mutation operations
    const mutationKeywords = [
        'INSERT',
        'UPDATE',
        'DELETE',
        'DROP',
        'ALTER',
        'TRUNCATE',
        'CREATE',
        'GRANT',
        'REVOKE',
    ];

    for (const keyword of mutationKeywords) {
        if (sqlUpper.includes(keyword)) {
            throw new Error(
                `SQL query contains forbidden operation: ${keyword}. Only SELECT queries are allowed.`
            );
        }
    }

    // Check for board_id filter (must use parameterized query)
    if (!sql.includes('board_id = $1')) {
        throw new Error(
            'SQL query must include "WHERE board_id = $1" to scope to the selected board'
        );
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
    if (!sqlUpper.startsWith('SELECT')) {
        throw new Error('Query must start with SELECT');
    }
}
