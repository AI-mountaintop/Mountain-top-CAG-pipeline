import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, ensureSupabaseConfigured } from '@/lib/supabase/client';

export async function GET(request: NextRequest) {
    try {
        ensureSupabaseConfigured();
        const { data: lists, error } = await supabaseAdmin
            .from('lists_CAG_custom')
            .select('id, name, url, description, last_synced, created_at, folder_id, folder_name')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Supabase fetch error details:', {
                message: error.message,
                details: error.details,
                hint: error.hint,
                code: error.code
            });
            throw new Error(`Failed to fetch lists: ${error.message}`);
        }

        // Get task counts for each list
        const listsWithStats = await Promise.all(
            (lists || []).map(async (list: any) => {
                try {
                    const { count } = await supabaseAdmin
                        .from('tasks_CAG_custom')
                        .select('*', { count: 'exact', head: true })
                        .eq('list_id', list.id);

                    return {
                        ...list,
                        cardCount: count || 0,
                    };
                } catch (err: any) {
                    console.error(`Error fetching stats for list ${list.id}:`, err);
                    return {
                        ...list,
                        cardCount: 0,
                    };
                }
            })
        );

        // Group by folder
        const groupedBoards = [];
        const folderMap = new Map();

        for (const list of listsWithStats) {
            if (list.folder_id) {
                if (!folderMap.has(list.folder_id)) {
                    folderMap.set(list.folder_id, {
                        id: list.folder_id,
                        name: list.folder_name || 'Unknown Folder',
                        description: 'Folder',
                        type: 'folder',
                        cardCount: 0,
                        last_synced: list.last_synced,
                        created_at: list.created_at,
                        lists: []
                    });
                }
                const folder = folderMap.get(list.folder_id);
                folder.cardCount += list.cardCount;
                folder.lists.push(list);
                // Update last_synced to be the most recent
                if (new Date(list.last_synced) > new Date(folder.last_synced)) {
                    folder.last_synced = list.last_synced;
                }
            } else {
                groupedBoards.push({
                    ...list,
                    type: 'list'
                });
            }
        }

        // Add folders to groupedBoards
        for (const folder of folderMap.values()) {
            groupedBoards.push(folder);
        }

        // Sort by created_at desc
        groupedBoards.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

        return NextResponse.json({ boards: groupedBoards });
    } catch (error: any) {
        console.error('Get lists error:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to fetch lists' },
            { status: 500 }
        );
    }
}
