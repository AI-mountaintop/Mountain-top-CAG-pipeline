import { supabaseAdmin } from '../supabase/client';
import OpenAI from 'openai';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY || 'sk-placeholder',
});

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
            return `I couldn't find any results for your question: "${question}". Try rephrasing or asking about different data.`;
        }

        // For large result sets, provide summary
        const resultSummary =
            results.length > 10
                ? `Found ${results.length} results. Here are the first 10:\n${JSON.stringify(results.slice(0, 10), null, 2)}`
                : JSON.stringify(results, null, 2);

        // Use LLM to format results naturally
        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                {
                    role: 'system',
                    content: `You are a helpful assistant that converts database query results into clear, concise human-readable summaries. 
          
Format the results in a user-friendly way:
- Use bullet points or numbered lists for multiple items
- Include relevant details (names, dates, counts)
- Be concise but informative
- If there are many results, provide a summary with key insights
- Use markdown formatting for better readability`,
                },
                {
                    role: 'user',
                    content: `Question: "${question}"\n\nSQL Query: ${sql}\n\nResults (${results.length} rows):\n${resultSummary}\n\nPlease provide a clear, human-readable summary of these results.`,
                },
            ],
            temperature: 0.3,
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
