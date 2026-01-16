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
            await deleteList(id);
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

        // Update the list name in Supabase
        const { data, error } = await supabaseAdmin
            .from('lists_CAG_custom')
            .update({ name: name.trim() })
            .eq('id', listId)
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
