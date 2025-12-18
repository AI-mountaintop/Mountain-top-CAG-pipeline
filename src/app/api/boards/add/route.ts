import { NextRequest, NextResponse } from 'next/server';
import { syncBoard } from '@/lib/trello/sync';
import { z } from 'zod';

const addBoardSchema = z.object({
    boardUrl: z.string().url('Invalid board URL'),
});

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { boardUrl } = addBoardSchema.parse(body);

        // Validate that it's a Trello URL
        if (!boardUrl.includes('trello.com/b/')) {
            return NextResponse.json(
                { error: 'Invalid Trello board URL. Must be in format: https://trello.com/b/{boardId}/...' },
                { status: 400 }
            );
        }

        // Trigger sync (this might take a while for large boards)
        const result = await syncBoard(boardUrl);

        return NextResponse.json({
            success: true,
            board: result.board,
            stats: result.stats,
            message: `Board "${result.board.name}" synced successfully`,
        });
    } catch (error: any) {
        console.error('Add board error:', error);

        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { error: 'Invalid request data', details: error.issues },
                { status: 400 }
            );
        }

        return NextResponse.json(
            { error: error.message || 'Failed to add board' },
            { status: 500 }
        );
    }
}
