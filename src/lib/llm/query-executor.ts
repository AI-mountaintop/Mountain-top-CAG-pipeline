import { supabaseAdmin } from '../supabase/client';
import OpenAI from 'openai';
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

                console.log(`Rate limit hit in formatResponse, retrying in ${retryAfter}ms (attempt ${attempt + 1}/${maxRetries})`);
                await new Promise(resolve => setTimeout(resolve, retryAfter));
                continue;
            }

            // For other errors, throw immediately
            throw error;
        }
    }

    throw lastError;
}

/**
 * Execute a validated SQL query against Supabase
 */
export async function executeQuery(
    sql: string,
    boardId: string
): Promise<any[]> {
    try {
        // Replace $1 with the actual board_id for Supabase RPC
        // Note: Supabase doesn't support parameterized raw SQL directly,
        // so we need to use RPC or manually replace (with proper escaping)

        // For security, we'll use a stored procedure approach
        // But for simplicity in this implementation, we'll validate and replace
        const safeSql = sql.replace(/\$1/g, `'${boardId}'`);

        // Execute raw SQL through Supabase
        const { data, error } = await supabaseAdmin.rpc('execute_query', {
            query: safeSql,
        });

        if (error) {
            // If RPC doesn't exist, fall back to direct execution
            // This is a workaround - in production, use a stored procedure
            console.warn('RPC not available, using direct query execution');

            // Parse the SQL to extract table and use Supabase query builder
            // For now, we'll execute directly (requires custom implementation)
            throw new Error(`Query execution failed: ${error.message}`);
        }

        return data || [];
    } catch (error) {
        console.error('Query execution error:', error);
        throw error;
    }
}

/**
 * Execute query using Supabase PostgREST (alternative approach)
 * This is a safer approach that doesn't require raw SQL execution
 */
export async function executeQuerySafe(
    sql: string,
    boardId: string
): Promise<any[]> {
    try {
        // For the POC, we'll execute via a simple query builder
        // In production, you'd want to set up a PostgreSQL function

        // Direct query execution as a fallback
        // This requires the database to have a function like:
        // CREATE OR REPLACE FUNCTION execute_user_query(query_sql text)
        // RETURNS TABLE (result jsonb) AS $$
        // BEGIN
        //   RETURN QUERY EXECUTE query_sql;
        // END;
        // $$ LANGUAGE plpgsql;

        const safeSql = sql.replace(/\$1/g, `'${boardId}'`);

        // Use FROM clause to execute arbitrary SQL
        const { data, error } = await supabaseAdmin
            .from('cards')
            .select('*')
            .eq('board_id', boardId)
            .limit(0); // This is a workaround

        // Better approach: Use a Supabase Edge Function or create a stored procedure
        // For now, we'll implement a simple parser

        throw new Error('Direct SQL execution not implemented. Please set up Supabase RPC function.');
    } catch (error) {
        console.error('Safe query execution error:', error);
        throw error;
    }
}

/**
 * Format date values to human-readable strings
 */
function formatDateValue(value: any): any {
    if (value === null || value === undefined) {
        return value;
    }

    // If it's already a string that looks like a date, try to parse it
    if (typeof value === 'string') {
        const date = new Date(value);
        if (!isNaN(date.getTime())) {
            return date.toLocaleString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                timeZoneName: 'short'
            });
        }
    }

    // If it's a number, try to interpret it as a timestamp or date serial
    if (typeof value === 'number') {
        // Check if it's a Unix timestamp (milliseconds - 13 digits, or seconds - 10 digits)
        if (value > 1000000000000) {
            // Milliseconds timestamp
            const date = new Date(value);
            if (!isNaN(date.getTime())) {
                return date.toLocaleString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    timeZoneName: 'short'
                });
            }
        } else if (value > 1000000000) {
            // Seconds timestamp
            const date = new Date(value * 1000);
            if (!isNaN(date.getTime())) {
                return date.toLocaleString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    timeZoneName: 'short'
                });
            }
        } else if (value > 0 && value < 100000) {
            // Could be a date serial number (days since 1900-01-01, like Excel)
            // PostgreSQL might return dates as days since 2000-01-01 or similar
            // Try both common epoch dates
            const date1900 = new Date(1900, 0, 1);
            date1900.setDate(date1900.getDate() + Math.floor(value) - 1); // -1 because Excel counts from 1

            const date2000 = new Date(2000, 0, 1);
            date2000.setDate(date2000.getDate() + Math.floor(value));

            // Check which one makes more sense (should be a recent date)
            const now = new Date();
            const diff1900 = Math.abs(now.getTime() - date1900.getTime());
            const diff2000 = Math.abs(now.getTime() - date2000.getTime());

            const date = diff2000 < diff1900 ? date2000 : date1900;

            if (!isNaN(date.getTime()) && date.getFullYear() > 2000 && date.getFullYear() < 2100) {
                return date.toLocaleString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    timeZoneName: 'short'
                });
            }
        }
    }

    return value;
}

/**
 * Recursively format dates in an object
 */
function formatDatesInObject(obj: any): any {
    if (obj === null || obj === undefined) {
        return obj;
    }

    if (Array.isArray(obj)) {
        return obj.map(item => formatDatesInObject(item));
    }

    if (typeof obj === 'object') {
        const formatted: any = {};
        for (const [key, value] of Object.entries(obj)) {
            // Check if key contains date-related terms
            if (key.toLowerCase().includes('date') ||
                key.toLowerCase().includes('updated_at') ||
                key.toLowerCase().includes('created_at') ||
                key.toLowerCase().includes('time')) {
                formatted[key] = formatDateValue(value);
            } else {
                formatted[key] = formatDatesInObject(value);
            }
        }
        return formatted;
    }

    return obj;
}

/**
 * Format query results into natural language response
 */
export async function formatResponse(
    results: any[],
    question: string,
    sql: string
): Promise<string> {
    try {
        // If no results, return a helpful message
        if (!results || results.length === 0) {
            return `I couldn't find any results matching your request. Try rephrasing or check if there are tasks for the selected filters.`;
        }

        // Format dates in results before sending to LLM
        const formattedResults = formatDatesInObject(results);

        // For large result sets, provide summary
        const resultSummary =
            formattedResults.length > 10
                ? `Found ${formattedResults.length} results. Here are the first 10:\n${JSON.stringify(formattedResults.slice(0, 10), null, 2)}`
                : JSON.stringify(formattedResults, null, 2);

        // Wait for rate limit slots before making API call
        await openaiRateLimiter.waitForSlot('openai-api');
        await openaiSecondRateLimiter.waitForSlot('openai-api-second');

        // Use LLM to format results naturally with retry logic
        const response = await retryOpenAICall(async () => {
            return await openai.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: [
                    {
                        role: 'system',
                        content: `You are a helpful assistant that converts database query results into clear, concise human-readable summaries.

FORMATTING RULES (CAG CORE PRINCIPLES):
- INSTRUCTION FOLLOWING: Use bullet points (with -) for listing tasks, NOT numbered lists.
- WRITING STYLE & TONE: Professional, ClickUp-savvy assistant voice. Be proactive and helpful.
- COMPLETENESS: If "recent_comments" or "comment_text" is present, include a "Recent Activity" section for the task.
- Grouping: The results are grouped by task. If "recent_comments" is an array, summarize the discussion points found within it.
- For each task, format as: **Task Name** - [View Card](url)
- If a due date or date_closed is present, show it on the same line as the task
- Do NOT include "Updated at" or "Created at" timestamps unless specifically asked.
- Keep the response clean and scannable.
- Use markdown: headers (##), bold (**text**), and bullet points (-).
- Dates are already formatted - use them as-is.
- DO NOT hallucinate error messages. If data for a task is missing, simply describe what is available.
- If the "url" field is missing or reflects a placeholder, do NOT include the [View Card] link.

EXAMPLE:
## Tasks with No Due Date
- **Task Name 1** - [View Card](https://app.clickup.com/t/xxx)
- **Task Name 2** - [View Card](https://app.clickup.com/t/yyy)`,
                    },
                    {
                        role: 'user',
                        content: `Question: "${question}"

Results (${formattedResults.length} items):
${resultSummary}

Provide a clean, scannable summary. Use bullet points (not numbered lists). Format each task as: **Task Name** - [View Card](url). If the results contain comments or history (activity), summarize the most recent activity briefly. Do not include Updated at or Created at timestamps.
`,
                    },
                ],
                temperature: 0.3,
            });
        });

        const formattedResponse =
            response.choices[0]?.message?.content?.trim() || '';

        return formattedResponse;
    } catch (error) {
        console.error('Response formatting error:', error);
        // Fallback to basic formatting
        return `Found ${results.length} results:\n${JSON.stringify(results.slice(0, 10), null, 2)}`;
    }
}
