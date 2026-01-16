import { NextRequest, NextResponse } from 'next/server';
import { getProgress, deleteProgress } from '@/lib/progress-store';

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const jobId = searchParams.get('jobId');

    if (!jobId) {
        return NextResponse.json(
            { error: 'Job ID required' },
            { status: 400 }
        );
    }

    const progress = getProgress(jobId);

    if (!progress || !progress.result) {
        return NextResponse.json(
            { error: 'Result not ready' },
            { status: 404 }
        );
    }

    // Convert base64 back to buffer
    const excelBuffer = Buffer.from(progress.result, 'base64');

    // Clean up progress
    deleteProgress(jobId);

    // Return Excel file
    return new NextResponse(excelBuffer, {
        headers: {
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': `attachment; filename="test-results-${new Date().toISOString().split('T')[0]}.xlsx"`,
        },
    });
}

