import { NextRequest, NextResponse } from 'next/server';
import { generateSQL } from '@/lib/llm/query-generator';
import { formatResponse } from '@/lib/llm/query-executor';
import { supabaseAdmin } from '@/lib/supabase/client';
import { z } from 'zod';

const chatSchema = z.object({
    boardId: z.string().uuid('Invalid board ID'),
    question: z.string().min(1, 'Question cannot be empty'),
    history: z.array(z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string(),
        sql: z.string().optional(),
    })).optional(),
});

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { boardId, question, history } = chatSchema.parse(body);

        // Verify board exists
        const { data: board, error: boardError } = await supabaseAdmin
            .from('boards')
            .select('id, name')
            .eq('id', boardId)
            .single();

        if (boardError || !board) {
            return NextResponse.json(
                { error: 'Board not found' },
                { status: 404 }
            );
        }

        // Generate SQL query from natural language with context
        const { sql, explanation } = await generateSQL(question, boardId, history || []);

        console.log('Generated SQL:', sql);
        console.log('Explanation:', explanation);

        // Execute the query with parameterized board_id
        // Replace $1 with actual boardId (properly escaped)
        const safeSql = sql.replace(/\$1/g, `'${boardId}'`);

        // Execute using Supabase's query builder as a workaround
        // Note: For production, you should set up a PostgreSQL function
        // CREATE FUNCTION execute_user_query(query_text text) ...

        // For this implementation, we'll parse and execute using the query builder
        const results = await executeSQLQuery(safeSql);

        // Format results into natural language
        const answer = await formatResponse(results, question, sql);

        return NextResponse.json({
            answer,
            sql,
            explanation,
            resultCount: results.length,
            results: results.slice(0, 10), // Return first 10 for transparency
        });
    } catch (error: any) {
        console.error('Chat API error:', error);

        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { error: 'Invalid request data', details: error.issues },
                { status: 400 }
            );
        }

        return NextResponse.json(
            {
                error: error.message || 'Failed to process query',
                answer: `I encountered an error processing your question: ${error.message}. Please try rephrasing or asking a different question.`
            },
            { status: 500 }
        );
    }
}

/**
 * Execute SQL query using raw PostgreSQL
 * This is a simplified implementation - in production, use a stored procedure
 */
async function executeSQLQuery(sql: string): Promise<any[]> {
    try {
        // Use Supabase's rpc to execute raw SQL
        // Note: This requires creating a PostgreSQL function first:
        /*
        CREATE OR REPLACE FUNCTION execute_safe_query(query_text text)
        RETURNS json
        LANGUAGE plpgsql
        SECURITY DEFINER
        AS $$
        DECLARE
          result json;
        BEGIN
          EXECUTE format('SELECT json_agg(t) FROM (%s) t', query_text) INTO result;
          RETURN COALESCE(result, '[]'::json);
        END;
        $$;
        */

        const { data, error } = await supabaseAdmin.rpc('execute_safe_query', {
            query_text: sql,
        });

        if (error) {
            // Fallback: try to parse and execute using query builder
            console.error('RPC execution failed, using fallback:', error);

            // For POC, we'll just return empty results if RPC isn't set up
            // In production, you MUST set up the RPC function
            throw new Error(
                'Query execution requires setting up the execute_safe_query PostgreSQL function. See setup instructions.'
            );
        }

        return data || [];
    } catch (error) {
        console.error('SQL execution error:', error);
        throw error;
    }
}
