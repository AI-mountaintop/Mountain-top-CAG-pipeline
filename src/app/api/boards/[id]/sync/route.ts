import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import { syncBoard } from '@/lib/trello/sync';

export async function POST(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const boardId = params.id;

        // 1. Get board URL from database
        const { data: board, error } = await supabaseAdmin
            .from('boards')
            .select('url, name')
            .eq('id', boardId)
            .single();

        if (error || !board) {
            return NextResponse.json(
                { error: 'Board not found' },
                { status: 404 }
            );
        }

        console.log(`Manual sync triggered for board: ${board.name} (${boardId})`);

        // 2. Trigger sync
        const result = await syncBoard(board.url);

        return NextResponse.json({
            success: true,
            message: 'Board synced successfully',
            stats: result.stats,
            last_synced: new Date().toISOString()
        });
    } catch (error: any) {
        console.error('Sync API error:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to sync board' },
            { status: 500 }
        );
    }
}
