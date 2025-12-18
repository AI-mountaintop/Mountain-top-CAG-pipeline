import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';

export async function GET(request: NextRequest) {
    try {
        const { data: boards, error } = await supabaseAdmin
            .from('boards')
            .select('id, name, url, description, last_synced, created_at')
            .order('created_at', { ascending: false });

        if (error) {
            throw new Error(`Failed to fetch boards: ${error.message}`);
        }

        // Get card counts for each board
        const boardsWithStats = await Promise.all(
            (boards || []).map(async (board) => {
                const { count } = await supabaseAdmin
                    .from('cards')
                    .select('*', { count: 'exact', head: true })
                    .eq('board_id', board.id);

                return {
                    ...board,
                    cardCount: count || 0,
                };
            })
        );

        return NextResponse.json({ boards: boardsWithStats });
    } catch (error: any) {
        console.error('Get boards error:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to fetch boards' },
            { status: 500 }
        );
    }
}
