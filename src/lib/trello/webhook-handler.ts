import { trelloClient } from './client';
import { supabaseAdmin } from '../supabase/client';

/**
 * Handle incoming webhook events from Trello
 * Processes delta updates for cards and lists
 */
export async function handleWebhookEvent(payload: any) {
    try {
        const { action } = payload;

        if (!action) {
            console.log('No action in webhook payload, ignoring');
            return { success: true };
        }

        console.log(`Processing webhook action: ${action.type}`);

        // Handle different action types
        switch (action.type) {
            // Card actions
            case 'createCard':
            case 'updateCard':
                await handleCardUpdate(action);
                break;

            case 'deleteCard':
                await handleCardDelete(action);
                break;

            // Card movement between lists
            case 'updateCard':
                if (action.data.listBefore) {
                    await handleCardUpdate(action);
                }
                break;

            // List updates (may affect cards)
            case 'updateList':
                await handleListUpdate(action);
                break;

            case 'deleteList':
                await handleListDelete(action);
                break;

            // Comment actions
            case 'commentCard':
            case 'copyCommentCard':
                await handleCommentCreate(action);
                break;

            case 'updateComment':
                await handleCommentUpdate(action);
                break;

            case 'deleteComment':
                await handleCommentDelete(action);
                break;

            // Ignore other actions for now
            default:
                console.log(`Ignoring action type: ${action.type}`);
        }

        // Update webhook last_event_at
        if (action.data?.board?.id) {
            await updateWebhookTimestamp(action.data.board.id);
        }

        return { success: true };
    } catch (error) {
        console.error('Webhook handler error:', error);
        // Return success anyway to prevent Trello from disabling the webhook
        return { success: true, error: String(error) };
    }
}

/**
 * Handle card create/update
 */
async function handleCardUpdate(action: any) {
    const cardId = action.data.card?.id;
    if (!cardId) return;

    try {
        // Fetch latest card data from Trello
        const cardData = await trelloClient.getCard(cardId);

        // Get internal board and list IDs
        const { data: board } = await supabaseAdmin
            .from('boards')
            .select('id')
            .eq('trello_board_id', cardData.idBoard)
            .single();

        if (!board) {
            console.error(`Board not found for card ${cardId}`);
            return;
        }

        const { data: list } = await supabaseAdmin
            .from('lists')
            .select('id')
            .eq('trello_list_id', cardData.idList)
            .single();

        // Upsert card
        const { error } = await supabaseAdmin.from('cards').upsert(
            {
                board_id: board.id,
                list_id: list?.id || null,
                trello_card_id: cardData.id,
                name: cardData.name,
                description: cardData.desc || null,
                position: cardData.pos,
                due_date: cardData.due || null,
                due_complete: cardData.dueComplete || false,
                is_closed: cardData.closed,
                labels: cardData.labels || [],
                members: cardData.members || [],
                checklists: cardData.checklists || [],
                attachments: cardData.attachments || [],
                url: cardData.url,
            },
            { onConflict: 'trello_card_id' }
        );

        if (error) {
            console.error(`Failed to upsert card ${cardId}:`, error);
        } else {
            console.log(`Card updated: ${cardData.name}`);
        }
    } catch (error) {
        console.error(`Error updating card ${cardId}:`, error);
    }
}

/**
 * Handle card delete
 */
async function handleCardDelete(action: any) {
    const cardId = action.data.card?.id;
    if (!cardId) return;

    try {
        const { error } = await supabaseAdmin
            .from('cards')
            .delete()
            .eq('trello_card_id', cardId);

        if (error) {
            console.error(`Failed to delete card ${cardId}:`, error);
        } else {
            console.log(`Card deleted: ${cardId}`);
        }
    } catch (error) {
        console.error(`Error deleting card ${cardId}:`, error);
    }
}

/**
 * Handle list update
 */
async function handleListUpdate(action: any) {
    const listId = action.data.list?.id;
    if (!listId) return;

    try {
        // For now, just update the list name if it changed
        const listData = action.data.list;

        const { error } = await supabaseAdmin
            .from('lists')
            .update({
                name: listData.name,
                is_closed: listData.closed || false,
            })
            .eq('trello_list_id', listId);

        if (error) {
            console.error(`Failed to update list ${listId}:`, error);
        } else {
            console.log(`List updated: ${listData.name}`);
        }
    } catch (error) {
        console.error(`Error updating list ${listId}:`, error);
    }
}

/**
 * Handle list delete (set list_id to null for affected cards)
 */
async function handleListDelete(action: any) {
    const listId = action.data.list?.id;
    if (!listId) return;

    try {
        // First, update cards to remove the list reference
        await supabaseAdmin
            .from('cards')
            .update({ list_id: null })
            .eq('trello_list_id', listId);

        // Then delete the list
        const { error } = await supabaseAdmin
            .from('lists')
            .delete()
            .eq('trello_list_id', listId);

        if (error) {
            console.error(`Failed to delete list ${listId}:`, error);
        } else {
            console.log(`List deleted: ${listId}`);
        }
    } catch (error) {
        console.error(`Error deleting list ${listId}:`, error);
    }
}

/**
 * Handle comment create
 */
async function handleCommentCreate(action: any) {
    const cardId = action.data.card?.id;
    if (!cardId) return;

    try {
        // Get internal card ID
        const { data: card } = await supabaseAdmin
            .from('cards')
            .select('id')
            .eq('trello_card_id', cardId)
            .single();

        if (!card) {
            console.error(`Card not found for comment ${action.id}`);
            return;
        }

        const { error } = await supabaseAdmin.from('comments').insert({
            card_id: card.id,
            trello_id: action.id,
            text: action.data.text,
            member_creator: action.memberCreator,
            date: action.date,
            type: action.type,
        });

        if (error) {
            console.error(`Failed to insert comment ${action.id}:`, error);
        } else {
            console.log(`Comment added to card ${cardId}`);
        }
    } catch (error) {
        console.error(`Error adding comment ${action.id}:`, error);
    }
}

/**
 * Handle comment update
 */
async function handleCommentUpdate(action: any) {
    const commentId = action.data.action?.id; // Trello sends original action ID here
    if (!commentId) return;

    try {
        const { error } = await supabaseAdmin
            .from('comments')
            .update({
                text: action.data.text,
                updated_at: new Date().toISOString(),
            })
            .eq('trello_id', commentId);

        if (error) {
            console.error(`Failed to update comment ${commentId}:`, error);
        } else {
            console.log(`Comment updated: ${commentId}`);
        }
    } catch (error) {
        console.error(`Error updating comment ${commentId}:`, error);
    }
}

/**
 * Handle comment delete
 */
async function handleCommentDelete(action: any) {
    const commentId = action.data.action?.id;
    if (!commentId) return;

    try {
        const { error } = await supabaseAdmin
            .from('comments')
            .delete()
            .eq('trello_id', commentId);

        if (error) {
            console.error(`Failed to delete comment ${commentId}:`, error);
        } else {
            console.log(`Comment deleted: ${commentId}`);
        }
    } catch (error) {
        console.error(`Error deleting comment ${commentId}:`, error);
    }
}

/**
 * Update webhook last_event_at timestamp
 */
async function updateWebhookTimestamp(trelloBoardId: string) {
    try {
        // Get internal board ID
        const { data: board } = await supabaseAdmin
            .from('boards')
            .select('id')
            .eq('trello_board_id', trelloBoardId)
            .single();

        if (!board) return;

        await supabaseAdmin
            .from('webhooks')
            .update({ last_event_at: new Date().toISOString() })
            .eq('board_id', board.id);

        // Also update the board's last_synced timestamp so the UI reflects recent activity
        await supabaseAdmin
            .from('boards')
            .update({ last_synced: new Date().toISOString() })
            .eq('id', board.id);
    } catch (error) {
        console.error('Error updating webhook timestamp:', error);
    }
}
