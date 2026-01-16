import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import { syncList } from '@/lib/clickup/sync';

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const listId = id;

        // 1. Get list URL from database
        const { data: list, error } = await supabaseAdmin
            .from('lists_CAG_custom')
            .select('url, name')
            .eq('id', listId)
            .single();

        if (error || !list) {
            return NextResponse.json(
                { error: 'List not found' },
                { status: 404 }
            );
        }

        console.log(`Manual sync triggered for list: ${list.name} (${listId})`);

        // 2. Trigger sync
        const result = await syncList(list.url);

        return NextResponse.json({
            success: true,
            message: 'List synced successfully',
            stats: result.stats,
            last_synced: new Date().toISOString()
        });
    } catch (error: any) {
        console.error('Sync API error:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to sync list' },
            { status: 500 }
        );
    }
}
