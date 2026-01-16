import { NextRequest, NextResponse } from 'next/server';
import { getProgress } from '@/lib/progress-store';

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

    if (!progress) {
        return NextResponse.json(
            { error: 'Job not found' },
            { status: 404 }
        );
    }

    return NextResponse.json(progress);
}

// Clean up old progress entries (older than 1 hour)
setInterval(() => {
    // This is a simple cleanup - in production, add timestamps and clean up properly
}, 3600000);

