import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { generateSQL } from '@/lib/llm/query-generator';
import { formatResponse } from '@/lib/llm/query-executor';
import { supabaseAdmin } from '@/lib/supabase/client';
import { setProgress } from '@/lib/stores';

// Configure route for file uploads
export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes for processing large test case files

// Background processing function
async function processTestCasesAsync(
    jobId: string,
    data: any[],
    headerRowIndex: number,
    testCasesColIndex: number,
    responseColIndex: number,
    boardId: string,
    totalTestCases: number,
    sheetName: string
) {
    const results: any[] = [];
    let processedCount = 0;
    let successCount = 0;
    let errorCount = 0;

    for (let i = headerRowIndex + 1; i < data.length; i++) {
        const row = data[i] as any[];
        const testCase = String(row[testCasesColIndex] || '').trim();

        if (!testCase) {
            // Copy empty row as-is
            results.push(row);
            continue;
        }

        // Update progress
        processedCount++;
        setProgress(jobId, {
            current: processedCount,
            total: totalTestCases,
            currentQuestion: testCase.length > 50 ? testCase.substring(0, 50) + '...' : testCase,
            status: 'processing',
            successCount,
            errorCount,
        });

        try {
            // Generate SQL and get response
            const { sql, explanation } = await generateSQL(testCase, boardId, []);

            // Execute query
            const safeSql = sql.replace(/\$1/g, `'${boardId}'`);
            const { data: queryData, error: queryError } = await supabaseAdmin.rpc('execute_safe_query', {
                query_text: safeSql,
            });

            let answer = '';
            if (queryError) {
                answer = `Error: ${queryError.message}`;
                errorCount++;
            } else {
                const queryResults = queryData || [];
                answer = await formatResponse(queryResults, testCase, sql);
                successCount++;
            }

            // Update the response column
            const newRow = [...row];
            while (newRow.length <= responseColIndex) {
                newRow.push('');
            }
            newRow[responseColIndex] = answer;
            results.push(newRow);

            // Increased delay to avoid OpenAI rate limiting
            // Wait 2-3 seconds between requests to stay under 30k tokens/min limit
            await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 1000));
        } catch (error: any) {
            errorCount++;
            // On error, add error message to response column with more details
            const newRow = [...row];
            while (newRow.length <= responseColIndex) {
                newRow.push('');
            }
            // Provide more helpful error message
            let errorMsg = error.message || 'Unknown error';
            if (errorMsg.includes('Query must start with SELECT')) {
                errorMsg = 'Error: Could not generate valid SQL query. Please rephrase the question.';
            }
            newRow[responseColIndex] = `Error: ${errorMsg}`;
            results.push(newRow);

            console.error(`Error processing test case "${testCase}":`, error);
        }
    }

    // Reconstruct the Excel file
    const outputData = [
        ...data.slice(0, headerRowIndex + 1), // Keep header rows
        ...results, // Add processed rows
    ];

    const outputWorksheet = XLSX.utils.aoa_to_sheet(outputData);
    const outputWorkbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(outputWorkbook, outputWorksheet, sheetName);

    // Generate Excel buffer
    const excelBuffer = XLSX.write(outputWorkbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

    // Mark as completed
    setProgress(jobId, {
        current: totalTestCases,
        total: totalTestCases,
        currentQuestion: '',
        status: 'completed',
        successCount,
        errorCount,
        result: excelBuffer.toString('base64'),
    });
}

export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData();
        const file = formData.get('file') as File;
        const boardId = formData.get('boardId') as string;

        if (!file) {
            return NextResponse.json(
                { error: 'No file provided' },
                { status: 400 }
            );
        }

        if (!boardId) {
            return NextResponse.json(
                { error: 'No list ID provided' },
                { status: 400 }
            );
        }

        // Verify list exists
        const { data: list, error: listError } = await supabaseAdmin
            .from('lists_CAG_custom')
            .select('id, name')
            .eq('id', boardId)
            .single();

        if (listError || !list) {
            return NextResponse.json(
                { error: 'List not found' },
                { status: 404 }
            );
        }

        // Read Excel file
        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

        // Find header row
        let headerRowIndex = -1;
        let testCasesColIndex = -1;
        let expectedOutputColIndex = -1;
        let responseColIndex = -1;

        for (let i = 0; i < Math.min(10, data.length); i++) {
            const row = data[i] as any[];
            const rowLower = row.map((cell: any) => String(cell).toLowerCase().trim());

            const testCasesIndex = rowLower.findIndex((cell: string) =>
                cell.includes('test case') || cell.includes('test cases') || cell === 'test cases'
            );
            const expectedIndex = rowLower.findIndex((cell: string) =>
                (cell.includes('expected') && cell.includes('output')) || cell === 'expected output'
            );
            const responseIndex = rowLower.findIndex((cell: string) =>
                (cell.includes('response') && (cell.includes('chatbot') || cell.includes('bot'))) ||
                cell === 'response from chatbot'
            );

            if (testCasesIndex !== -1) {
                headerRowIndex = i;
                testCasesColIndex = testCasesIndex;
                // Default to column indices if not found
                expectedOutputColIndex = expectedIndex !== -1 ? expectedIndex : (testCasesIndex + 1 < row.length ? testCasesIndex + 1 : 1);
                responseColIndex = responseIndex !== -1 ? responseIndex : (expectedOutputColIndex + 1);
                break;
            }
        }

        if (headerRowIndex === -1 || testCasesColIndex === -1) {
            return NextResponse.json(
                { error: 'Could not find "test cases" column in the Excel file' },
                { status: 400 }
            );
        }

        // Count total test cases (non-empty rows)
        const totalTestCases = (data.slice(headerRowIndex + 1) as unknown[][]).filter((row) => {
            const testCase = String(row[testCasesColIndex] || '').trim();
            return testCase.length > 0;
        }).length;

        // Generate job ID
        const jobId = `job-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        // Initialize progress
        setProgress(jobId, {
            current: 0,
            total: totalTestCases,
            currentQuestion: 'Initializing...',
            status: 'processing',
            successCount: 0,
            errorCount: 0,
        });

        // Return jobId immediately and process in background
        // Process asynchronously without blocking the response
        processTestCasesAsync(jobId, data, headerRowIndex, testCasesColIndex, responseColIndex, boardId, totalTestCases, sheetName).catch((error) => {
            console.error('Background processing error:', error);
            setProgress(jobId, {
                current: 0,
                total: totalTestCases,
                currentQuestion: '',
                status: 'error',
                successCount: 0,
                errorCount: 0,
                error: error.message || 'Processing failed',
            });
        });

        // Return immediately with jobId
        return NextResponse.json({
            jobId,
            message: 'Processing started',
            total: totalTestCases,
        }, {
            headers: {
                'Content-Type': 'application/json',
            },
        });
    } catch (error: any) {
        console.error('Test cases processing error:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to process test cases' },
            { status: 500 }
        );
    }
}

