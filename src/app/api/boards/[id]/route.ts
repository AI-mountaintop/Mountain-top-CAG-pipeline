import { NextRequest, NextResponse } from 'next/server';
import { deleteBoard } from '@/lib/trello/sync';

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: boardId } = await params;

        if (!boardId) {
            return NextResponse.json(
                { error: 'Board ID is required' },
                { status: 400 }
            );
        }

        await deleteBoard(boardId);

        return NextResponse.json({
            success: true,
            message: 'Board deleted successfully',
        });
    } catch (error: any) {
        console.error('Delete board error:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to delete board' },
            { status: 500 }
        );
    }
}
