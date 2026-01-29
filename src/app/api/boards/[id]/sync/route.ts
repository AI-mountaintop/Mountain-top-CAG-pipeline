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

        // 1. Get list URL from database - support both internal UUID and ClickUp ID
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(listId);

        const query = supabaseAdmin
            .from('lists_CAG_custom')
            .select('id, url, name');

        if (isUuid) {
            query.eq('id', listId);
        } else {
            query.eq('clickup_list_id', listId);
        }

        const { data: list, error } = await query.single();

        if (error || !list) {
            // 1b. Check if it's a folder ID
            const { data: folderLists, error: folderError } = await supabaseAdmin
                .from('lists_CAG_custom')
                .select('url, name')
                .eq('folder_id', listId);

            if (folderError || !folderLists || folderLists.length === 0) {
                return NextResponse.json(
                    { error: 'List or Folder not found' },
                    { status: 404 }
                );
            }

            console.log(`Manual sync triggered for folder with ${folderLists.length} lists (${listId})`);

            // Sync all lists in folder
            const results = await Promise.all(
                folderLists.map((l: { url: string; name: string }) => syncList(l.url))
            );

            return NextResponse.json({
                success: true,
                message: `Folder synced successfully (${folderLists.length} lists)`,
                results,
                last_synced: new Date().toISOString()
            });
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
