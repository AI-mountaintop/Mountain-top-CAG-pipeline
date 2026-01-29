import { NextRequest, NextResponse } from 'next/server';
import { generateSQL } from '@/lib/llm/query-generator';
import { formatResponse } from '@/lib/llm/query-executor';
import { supabaseAdmin } from '@/lib/supabase/client';
import { z } from 'zod';
import { classifyIntent, generateTaskSummary, generateClarification } from '@/lib/llm/intent-classifier';

const chatSchema = z.object({
    boardId: z.string().min(1, 'List/Folder ID is required'),
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

        // 1. INTENT CLASSIFICATION (Mandatory First Step)
        const intentResult = await classifyIntent(question, history || []);

        // 2. CLARIFICATION GATE (Mandatory)
        const normalizedIntent = (intentResult.intent || '').toUpperCase();
        const lowercaseQuestion = question.toLowerCase();
        // Manual fallback for very common vague terms that might skip LLM detection
        const isVagueTerm = (lowercaseQuestion.includes('recent') || lowercaseQuestion.includes('latest') || lowercaseQuestion.includes('summary')) && !lowercaseQuestion.match(/\d/);

        if (normalizedIntent === 'CLARIFICATION_REQUIRED' || intentResult.is_vague === true || isVagueTerm) {

            const clarificationQuestion = await generateClarification(intentResult, question);
            return NextResponse.json({
                answer: clarificationQuestion,
                intent: normalizedIntent,
                is_clarification: true,
                intentResult
            });
        }

        // 3. ROUTING LOGIC
        if (normalizedIntent === 'NON_DB') {
            return NextResponse.json({
                answer: "I'm sorry, but I can only assist with ClickUp task management and project data. How can I help you with your boards or tasks today?",
                intent: 'NON_DB'
            });
        }

        let scope: 'list' | 'folder' = 'list';

        // Verify list or folder exists
        const { data: list } = await supabaseAdmin
            .from('lists_CAG_custom')
            .select('id, name')
            .eq('id', boardId)
            .single();

        if (!list) {
            const { data: folderList } = await supabaseAdmin
                .from('lists_CAG_custom')
                .select('folder_id, folder_name')
                .eq('folder_id', boardId)
                .limit(1)
                .single();

            if (folderList) {
                scope = 'folder';
            } else {
                return NextResponse.json({ error: 'List or Folder not found' }, { status: 404 });
            }
        }

        // Handle Follow-up context
        if (normalizedIntent === 'FOLLOW_UP' && intentResult.refers_to_previous) {
            console.log('Detected follow-up intent');
        }

        // Route TASK_SUMMARIZATION
        if (normalizedIntent === 'TASK_SUMMARIZATION') {
            const { sql } = await generateSQL(question, boardId, history || [], scope, intentResult, { currentTime: new Date().toISOString() });
            const trimmedSql = sql.trim().replace(/;+$/, '');
            console.log('--- GENERATED SQL (TASK_SUMMARIZATION) ---');
            console.log(trimmedSql);
            console.log('-----------------------------------------');
            const safeSql = trimmedSql.replace(/\$1/g, `'${boardId}'`);
            console.log('--- FINAL PROCESSED SQL (TASK_SUMMARIZATION) ---');
            console.log(safeSql);
            console.log('------------------------------------------------');
            const rawResults = await executeSQLQuery(safeSql);

            if (rawResults.length === 0) {
                return NextResponse.json({
                    answer: "I couldn't find any tasks matching your request to summarize.",
                    sql
                });
            }

            const results = await processResults(rawResults);
            const summary = await generateTaskSummary(results);

            return NextResponse.json({
                answer: summary,
                sql,
                resultCount: results.length,
                results: results.slice(0, 5)
            });
        }

        // Standard Routing
        const { sql, explanation } = await generateSQL(question, boardId, history || [], scope, intentResult, { currentTime: new Date().toISOString() });
        const trimmedSql = sql.trim().replace(/;+$/, '');
        console.log('--- GENERATED SQL (STANDARD) ---');
        console.log(trimmedSql);
        if (explanation) console.log('EXPLANATION:', explanation);
        console.log('-------------------------------');
        const safeSql = trimmedSql.replace(/\$1/g, `'${boardId}'`);
        console.log('--- FINAL PROCESSED SQL (STANDARD) ---');
        console.log(safeSql);
        console.log('--------------------------------------');
        const rawResults = await executeSQLQuery(safeSql);

        const results = await processResults(rawResults);
        const answer = await formatResponse(results, question, sql);

        return NextResponse.json({
            answer,
            sql,
            explanation,
            resultCount: results.length,
            results: results.slice(0, 10)
        });

    } catch (error: any) {
        console.error('Chat API error:', error);
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: 'Invalid request data', details: error.issues }, { status: 400 });
        }
        return NextResponse.json({
            error: error.message || 'Failed to process query',
            answer: `I encountered an error processing your question: ${error.message}. Please try rephrasing or asking a different question.`
        }, { status: 500 });
    }
}

async function processResults(rawResults: any[]) {
    const { normalizeStatus } = await import('@/lib/clickup/pms-semantics');

    // Only group if we have comment data (multiple rows per task)
    // Otherwise, return results as-is to avoid collapsing distinct tasks
    const hasComments = rawResults.some(row => row.comment_text);

    if (!hasComments) {
        // No grouping needed - just normalize status
        return rawResults.map(row => ({
            ...row,
            canonical_status: row.status ? normalizeStatus(row.status, row.status_type) : undefined
        }));
    }

    // Group by task ID to handle multiple comments/subtasks rows correctly
    const resultsByTask = new Map();
    rawResults.forEach((row: any) => {
        // Use clickup_task_id as the primary key for grouping, fallback to internal id, then name
        const taskId = row.clickup_task_id || row.id || row.name;

        if (!resultsByTask.has(taskId)) {
            resultsByTask.set(taskId, {
                ...row,
                canonical_status: row.status ? normalizeStatus(row.status, row.status_type) : undefined,
                recent_comments: []
            });
        }

        // Aggregate comments from multiple rows if present
        if (row.comment_text) {
            const existingTask = resultsByTask.get(taskId);
            const isNewComment = !existingTask.recent_comments.some((c: any) => c.text === row.comment_text);
            if (isNewComment) {
                existingTask.recent_comments.push({
                    text: row.comment_text,
                    user: row.user,
                    date: row.comment_date
                });
            }
        }
    });

    return Array.from(resultsByTask.values());
}

async function executeSQLQuery(sql: string): Promise<any[]> {
    try {
        const { data, error } = await supabaseAdmin.rpc('execute_safe_query', {
            query_text: sql,
        });

        if (error) {
            console.error('RPC execution failed:', error);
            throw new Error('Query execution failed. Please ensure the execute_safe_query function is set up in Supabase.');
        }

        // Ensure we always return an array
        if (!data) {
            return [];
        }

        // If data is already an array, return it
        if (Array.isArray(data)) {
            return data;
        }

        // If data is an object with a results property (some RPC functions wrap results)
        if (typeof data === 'object' && Array.isArray(data.results)) {
            return data.results;
        }

        // If data is a single object, wrap it in an array
        if (typeof data === 'object' && data !== null) {
            // Check if the object itself is an error (some RPCs return {error: "..."})
            if (data.error && Object.keys(data).length === 1) {
                console.error('Database application error:', data.error);
                throw new Error(data.error);
            }
            return [data];
        }

        // Fallback to empty array
        console.warn('Unexpected data format from RPC:', typeof data);
        return [];
    } catch (error) {
        console.error('SQL execution error:', error);
        throw error;
    }
}
