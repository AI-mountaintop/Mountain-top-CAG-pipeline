import { NextRequest, NextResponse } from 'next/server';
import { deleteList, deleteFolder } from '@/lib/clickup/sync';
import { supabaseAdmin } from '@/lib/supabase/client';

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const searchParams = request.nextUrl.searchParams;
        const type = searchParams.get('type') || 'list';

        if (!id) {
            return NextResponse.json(
                { error: 'ID is required' },
                { status: 400 }
            );
        }

        if (type === 'folder') {
            await deleteFolder(id);
        } else {
            // Smart detection: Check if it's a list ID first (internal UUID or ClickUp ID)
            const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
            const query = supabaseAdmin.from('lists_CAG_custom').select('id');
            if (isUuid) query.eq('id', id); else query.eq('clickup_list_id', id);

            const { data: list } = await query.single();

            if (list) {
                await deleteList(list.id);
            } else {
                // If not found in lists, check if it's a folder ID
                const { data: folderLists } = await supabaseAdmin
                    .from('lists_CAG_custom')
                    .select('id')
                    .eq('folder_id', id)
                    .limit(1);

                if (folderLists && folderLists.length > 0) {
                    await deleteFolder(id);
                } else {
                    return NextResponse.json(
                        { error: 'List or Folder not found' },
                        { status: 404 }
                    );
                }
            }
        }

        return NextResponse.json({
            success: true,
            message: `${type === 'folder' ? 'Folder' : 'List'} deleted successfully`,
        });
    } catch (error: any) {
        console.error('Delete list error:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to delete list' },
            { status: 500 }
        );
    }
}

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: listId } = await params;
        const body = await request.json();
        const { name } = body;

        if (!listId) {
            return NextResponse.json(
                { error: 'List ID is required' },
                { status: 400 }
            );
        }

        if (!name || typeof name !== 'string' || name.trim().length === 0) {
            return NextResponse.json(
                { error: 'Name is required' },
                { status: 400 }
            );
        }

        // Update the list name in Supabase - support both internal UUID and ClickUp ID
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(listId);
        const query = supabaseAdmin
            .from('lists_CAG_custom')
            .update({ name: name.trim() });

        if (isUuid) {
            query.eq('id', listId);
        } else {
            query.eq('clickup_list_id', listId);
        }

        const { data, error } = await query
            .select()
            .single();

        if (error) {
            throw new Error(`Failed to update list: ${error.message}`);
        }

        return NextResponse.json({
            success: true,
            message: 'List updated successfully',
            board: data
        });
    } catch (error: any) {
        console.error('Update list error:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to update list' },
            { status: 500 }
        );
    }
}
