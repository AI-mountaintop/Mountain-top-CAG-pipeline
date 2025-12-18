import { trelloClient } from './client';
import { supabaseAdmin } from '../supabase/client';

const WEBHOOK_CALLBACK_URL = process.env.TRELLO_WEBHOOK_CALLBACK_URL!;

/**
 * Sync a Trello board to the database
 * Performs initial data ingestion: board metadata, lists, and cards
 */
export async function syncBoard(boardUrl: string) {
    try {
        console.log(`Starting sync for board: ${boardUrl}`);

        // Extract board ID from URL
        const boardId = trelloClient.extractBoardId(boardUrl);

        // 1. Fetch and upsert board metadata
        const boardData = await trelloClient.getBoard(boardId);
        const { data: board, error: boardError } = await supabaseAdmin
            .from('boards')
            .upsert(
                {
                    trello_board_id: boardData.id,
                    name: boardData.name,
                    url: boardData.url,
                    description: boardData.desc || null,
                    last_synced: new Date().toISOString(),
                },
                { onConflict: 'trello_board_id' }
            )
            .select()
            .single();

        if (boardError) {
            throw new Error(`Failed to upsert board: ${boardError.message}`);
        }

        console.log(`Board synced: ${board.name} (${board.id})`);

        // 2. Fetch and upsert all lists
        const listsData = await trelloClient.getLists(boardId);
        const listsToUpsert = listsData.map((list) => ({
            board_id: board.id,
            trello_list_id: list.id,
            name: list.name,
            position: list.pos,
            is_closed: list.closed,
        }));

        const { error: listsError } = await supabaseAdmin
            .from('lists')
            .upsert(listsToUpsert, { onConflict: 'trello_list_id' });

        if (listsError) {
            throw new Error(`Failed to upsert lists: ${listsError.message}`);
        }

        console.log(`Synced ${listsToUpsert.length} lists`);

        // Get list IDs mapping (trello_list_id -> internal UUID)
        const { data: lists } = await supabaseAdmin
            .from('lists')
            .select('id, trello_list_id')
            .eq('board_id', board.id);

        const listIdMap = new Map(
            lists?.map((l) => [l.trello_list_id, l.id]) || []
        );

        // 3. Fetch and upsert all cards
        const cardsData = await trelloClient.getCards(boardId);
        const cardsToUpsert = cardsData.map((card) => ({
            board_id: board.id,
            list_id: listIdMap.get(card.idList) || null,
            trello_card_id: card.id,
            name: card.name,
            description: card.desc || null,
            position: card.pos,
            due_date: card.due || null,
            due_complete: card.dueComplete || false,
            is_closed: card.closed,
            labels: card.labels || [],
            members: card.members || [],
            checklists: card.checklists || [],
            attachments: card.attachments || [],
            status: null, // Can be derived from list name later
            url: card.url,
        }));

        // Batch upsert cards (Supabase has a limit, so chunk if needed)
        const BATCH_SIZE = 100;
        for (let i = 0; i < cardsToUpsert.length; i += BATCH_SIZE) {
            const batch = cardsToUpsert.slice(i, i + BATCH_SIZE);
            const { error: cardsError } = await supabaseAdmin
                .from('cards')
                .upsert(batch, { onConflict: 'trello_card_id' });

            if (cardsError) {
                throw new Error(
                    `Failed to upsert cards (batch ${i / BATCH_SIZE + 1}): ${cardsError.message}`
                );
            }
        }

        console.log(`Synced ${cardsToUpsert.length} cards`);

        // 3.5 Fetch and upsert comments (actions)
        console.log('Fetching comments...');
        const actions = await trelloClient.getActions(boardId);

        // Get card IDs mapping (trello_card_id -> internal UUID)
        const { data: cards } = await supabaseAdmin
            .from('cards')
            .select('id, trello_card_id')
            .eq('board_id', board.id);

        const cardIdMap = new Map(
            cards?.map((c) => [c.trello_card_id, c.id]) || []
        );

        const commentsToUpsert = actions
            .filter((action) => action.type === 'commentCard' && action.data.card && cardIdMap.has(action.data.card.id))
            .map((action) => ({
                card_id: cardIdMap.get(action.data.card.id),
                trello_id: action.id,
                text: action.data.text,
                member_creator: action.memberCreator,
                date: action.date,
                type: action.type,
            }));

        if (commentsToUpsert.length > 0) {
            // Batch upsert comments
            const COMMENT_BATCH_SIZE = 100;
            for (let i = 0; i < commentsToUpsert.length; i += COMMENT_BATCH_SIZE) {
                const batch = commentsToUpsert.slice(i, i + COMMENT_BATCH_SIZE);
                const { error: commentsError } = await supabaseAdmin
                    .from('comments')
                    .upsert(batch, { onConflict: 'trello_id' });

                if (commentsError) {
                    console.error(`Failed to upsert comments batch ${i}:`, commentsError);
                }
            }
            console.log(`Synced ${commentsToUpsert.length} comments`);
        } else {
            console.log('No comments to sync');
        }

        // 4. Register webhook if not already registered
        // Use the full Trello board ID from the API response, not the short URL ID
        await registerWebhook(board.id, boardData.id);

        console.log(`Sync completed for board: ${board.name}`);

        return {
            success: true,
            board,
            stats: {
                lists: listsToUpsert.length,
                cards: cardsToUpsert.length,
            },
        };
    } catch (error) {
        console.error('Sync error:', error);
        throw error;
    }
}

/**
 * Register a webhook for a board if not already registered
 */
async function registerWebhook(internalBoardId: string, trelloBoardId: string) {
    if (!WEBHOOK_CALLBACK_URL) {
        console.warn('TRELLO_WEBHOOK_CALLBACK_URL not set, skipping webhook registration');
        return;
    }

    // Check if webhook already exists
    const { data: existingWebhook } = await supabaseAdmin
        .from('webhooks')
        .select('*')
        .eq('board_id', internalBoardId)
        .eq('is_active', true)
        .single();

    if (existingWebhook) {
        console.log(`Webhook already registered for board ${internalBoardId}`);
        return;
    }

    try {
        // Create webhook in Trello
        console.log(`Creating webhook for board ${trelloBoardId} with callback ${WEBHOOK_CALLBACK_URL}`);
        const webhook = await trelloClient.createWebhook(
            trelloBoardId,
            WEBHOOK_CALLBACK_URL
        );

        console.log(`Trello webhook created successfully:`, webhook);

        // Store webhook info in database
        const { error } = await supabaseAdmin.from('webhooks').insert({
            board_id: internalBoardId,
            trello_webhook_id: webhook.id,
            callback_url: WEBHOOK_CALLBACK_URL,
            is_active: true,
        });

        if (error) {
            throw new Error(`Failed to store webhook: ${error.message}`);
        }

        console.log(`✅ Webhook registered successfully: ${webhook.id}`);
    } catch (error: any) {
        console.error('❌ Webhook registration error:');
        console.error('Error message:', error.message);
        console.error('Error details:', JSON.stringify(error, null, 2));
        console.error('Full error:', error);
        // Don't fail the entire sync if webhook registration fails
    }
}

/**
 * Delete a board and all its data
 */
export async function deleteBoard(boardId: string) {
    try {
        // Get webhooks for this board
        const { data: webhooks } = await supabaseAdmin
            .from('webhooks')
            .select('trello_webhook_id')
            .eq('board_id', boardId);

        // Delete webhooks from Trello
        if (webhooks) {
            for (const webhook of webhooks) {
                try {
                    await trelloClient.deleteWebhook(webhook.trello_webhook_id);
                } catch (error) {
                    console.error(`Failed to delete webhook ${webhook.trello_webhook_id}:`, error);
                }
            }
        }

        // Delete board (cascades to lists, cards, webhooks)
        const { error } = await supabaseAdmin
            .from('boards')
            .delete()
            .eq('id', boardId);

        if (error) {
            throw new Error(`Failed to delete board: ${error.message}`);
        }

        return { success: true };
    } catch (error) {
        console.error('Delete board error:', error);
        throw error;
    }
}
