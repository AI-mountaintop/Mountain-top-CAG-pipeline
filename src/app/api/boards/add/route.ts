import { NextRequest, NextResponse } from 'next/server';
import { syncList, syncFolder } from '@/lib/clickup/sync';
import { clickupClient } from '@/lib/clickup/client';
import { z } from 'zod';

const addListSchema = z.object({
    boardUrl: z.string().url('Invalid list URL'),
});

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { boardUrl } = addListSchema.parse(body);

        // Check if it's a folder URL
        const folderId = clickupClient.extractFolderId(boardUrl);
        if (folderId) {
            const result = await syncFolder(boardUrl);
            return NextResponse.json({
                success: true,
                message: `Folder synced successfully (${result.syncedLists.length} lists)`,
                folderId: result.folderId
            });
        }

        // Validate that it's a ClickUp URL (List)
        // Accept both formats: /v/l/{listId} or /li/{listId}
        if (!boardUrl.includes('clickup.com') || (!boardUrl.includes('/v/l/') && !boardUrl.includes('/li/'))) {
            return NextResponse.json(
                { error: 'Invalid ClickUp URL. Must be a List or Folder URL.' },
                { status: 400 }
            );
        }

        // Trigger sync (this might take a while for large lists)
        const result = await syncList(boardUrl);

        return NextResponse.json({
            success: true,
            board: result.list, // Keep 'board' key for frontend compatibility
            stats: result.stats,
            message: `List "${result.list.name}" synced successfully`,
        });
    } catch (error: any) {
        console.error('Add list error:', error);

        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { error: 'Invalid request data', details: error.issues },
                { status: 400 }
            );
        }

        return NextResponse.json(
            { error: error.message || 'Failed to add list' },
            { status: 500 }
        );
    }
}
