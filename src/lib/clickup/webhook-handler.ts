import { clickupClient } from './client';
import { supabaseAdmin } from '../supabase/client';

/**
 * Handle incoming webhook events from ClickUp
 * Processes delta updates for tasks and comments
 */
export async function handleWebhookEvent(payload: any) {
    try {
        const { event, task_id, list_id } = payload;

        if (!event) {
            console.log('No event in webhook payload, ignoring');
            return { success: true };
        }

        console.log(`Processing webhook event: ${event.type} for task ${task_id}`);

        // Handle different event types
        switch (event.type) {
            // Task actions
            case 'taskCreated':
            case 'taskUpdated':
                await handleTaskUpdate(event, task_id, list_id);
                break;

            case 'taskDeleted':
                await handleTaskDelete(event, task_id, list_id);
                break;

            // Comment actions
            case 'taskCommentPosted':
                await handleCommentCreate(event, task_id, list_id);
                break;

            case 'taskCommentUpdated':
                await handleCommentUpdate(event, task_id, list_id);
                break;

            case 'taskCommentDeleted':
                await handleCommentDelete(event, task_id, list_id);
                break;

            // Ignore other events for now
            default:
                console.log(`Ignoring event type: ${event.type}`);
        }

        // Update webhook last_event_at
        if (list_id) {
            await updateWebhookTimestamp(list_id);
        }

        return { success: true };
    } catch (error) {
        console.error('Webhook handler error:', error);
        // Return success anyway to prevent ClickUp from disabling the webhook
        return { success: true, error: String(error) };
    }
}

/**
 * Handle task create/update
 */
async function handleTaskUpdate(event: any, taskId: string, listId: string) {
    if (!taskId) return;

    try {
        // Fetch latest task data from ClickUp
        const taskData = await clickupClient.getTask(taskId);

        // Parse the new due date from ClickUp
        const newDueDate = taskData.due_date
            ? new Date(parseInt(taskData.due_date)).toISOString()
            : null;

        // Check for due date changes by fetching existing task
        const { data: existingTask } = await supabaseAdmin
            .from('tasks_CAG_custom')
            .select('id, due_date')
            .eq('clickup_task_id', taskId)
            .single();

        // Log due date change if the task exists and due_date is different
        if (existingTask) {
            const oldDueDate = existingTask.due_date;

            // Compare due dates (handle null comparisons)
            const dueDateChanged = oldDueDate !== newDueDate &&
                (oldDueDate !== null || newDueDate !== null);

            if (dueDateChanged) {
                try {
                    await supabaseAdmin.from('task_due_date_history').insert({
                        task_id: existingTask.id,
                        clickup_task_id: taskId,
                        old_due_date: oldDueDate,
                        new_due_date: newDueDate,
                        changed_by: event.user || null,
                    });
                    console.log(`📅 Due date changed for task ${taskId}: ${oldDueDate || 'none'} → ${newDueDate || 'none'}`);
                } catch (historyError) {
                    // Don't fail the task update if history logging fails
                    console.error(`Failed to log due date change for task ${taskId}:`, historyError);
                }
            }
        }

        // Get internal list ID
        const { data: list } = await supabaseAdmin
            .from('lists')
            .select('id')
            .eq('clickup_list_id', listId || taskData.list.id)
            .single();

        if (!list) {
            console.error(`List not found for task ${taskId}`);
            return;
        }

        // Upsert task with ALL ClickUp fields
        const { error } = await supabaseAdmin.from('tasks_CAG_custom').upsert(
            {
                list_id: list.id,
                clickup_task_id: taskData.id,
                custom_id: taskData.custom_id || null,
                name: taskData.name,
                description: taskData.description || null,
                text_content: taskData.text_content || null,
                position: parseFloat(taskData.orderindex) || 0,
                orderindex: taskData.orderindex || null,

                // Dates
                due_date: taskData.due_date ? new Date(parseInt(taskData.due_date)).toISOString() : null,
                start_date: taskData.start_date ? new Date(parseInt(taskData.start_date)).toISOString() : null,
                date_closed: taskData.date_closed ? new Date(taskData.date_closed).toISOString() : null,
                date_done: taskData.date_done ? new Date(taskData.date_done).toISOString() : null,
                date_created: taskData.date_created ? new Date(parseInt(taskData.date_created)).toISOString() : null,
                date_updated: taskData.date_updated ? new Date(parseInt(taskData.date_updated)).toISOString() : null,

                // Status
                is_archived: taskData.archived || false,
                status: taskData.status?.status || null,
                status_color: taskData.status?.color || null,
                status_type: taskData.status?.type || null,
                status_orderindex: taskData.status?.orderindex || null,

                // Priority
                priority: taskData.priority?.priority || null,
                priority_color: taskData.priority?.color || null,
                priority_id: taskData.priority?.id || null,
                priority_orderindex: taskData.priority?.orderindex || null,

                // Relationships
                parent_task_id: taskData.parent || null,
                dependencies: taskData.dependencies || [],
                linked_tasks: taskData.linked_tasks || [],

                // Team and permissions
                team_id: taskData.team_id || null,
                permission_level: taskData.permission_level || null,

                // Sharing
                sharing: taskData.sharing || {},

                // JSONB fields
                tags: taskData.tags || [],
                assignees: taskData.assignees || [],
                watchers: taskData.watchers || [],
                checklists: taskData.checklists || [],
                custom_fields: taskData.custom_fields || [],
                creator: taskData.creator || {},

                // Context information
                list_info: taskData.list || {},
                project_info: taskData.project || {},
                folder_info: taskData.folder || {},
                space_info: taskData.space || {},

                // Time tracking
                time_estimate: taskData.time_estimate || null,
                time_spent: taskData.time_spent || null,
                points: taskData.points || null,

                // URL
                url: taskData.url,
            },
            { onConflict: 'clickup_task_id' }
        );

        if (error) {
            console.error(`Failed to upsert task ${taskId}:`, error);
        } else {
            console.log(`Task updated: ${taskData.name}`);
        }
    } catch (error) {
        console.error(`Error updating task ${taskId}:`, error);
    }
}

/**
 * Handle task delete
 */
async function handleTaskDelete(event: any, taskId: string, listId: string) {
    if (!taskId) return;

    try {
        const { error } = await supabaseAdmin
            .from('tasks_CAG_custom')
            .delete()
            .eq('clickup_task_id', taskId);

        if (error) {
            console.error(`Failed to delete task ${taskId}:`, error);
        } else {
            console.log(`Task deleted: ${taskId}`);
        }
    } catch (error) {
        console.error(`Error deleting task ${taskId}:`, error);
    }
}

/**
 * Handle comment create
 */
async function handleCommentCreate(event: any, taskId: string, listId: string) {
    if (!taskId) return;

    try {
        // Get internal task ID
        const { data: task } = await supabaseAdmin
            .from('tasks_CAG_custom')
            .select('id')
            .eq('clickup_task_id', taskId)
            .single();

        if (!task) {
            console.error(`Task not found for comment ${event.comment?.id || 'unknown'}`);
            return;
        }

        // Fetch comment details from ClickUp
        const commentsData = await clickupClient.getComments(taskId);
        const comment = commentsData.comments.find(c => c.id === event.comment?.id);

        if (!comment) {
            console.error(`Comment not found: ${event.comment?.id}`);
            return;
        }

        const { error } = await supabaseAdmin.from('comments_CAG_custom').upsert({
            task_id: task.id,
            clickup_id: comment.id,
            text: comment.comment_text || (comment.comment && comment.comment[0]?.text) || null,
            comment_text: comment.comment_text || null,
            user: comment.user || {},
            resolved: comment.resolved || false,
            assignee: comment.assignee || null,
            assigned_by: comment.assigned_by || null,
            reactions: comment.reactions || [],
            date: comment.date ? new Date(parseInt(comment.date)).toISOString() : new Date().toISOString(),
        }, { onConflict: 'clickup_id' });

        if (error) {
            console.error(`Failed to insert comment ${comment.id}:`, error);
        } else {
            console.log(`Comment added to task ${taskId}`);
        }
    } catch (error) {
        console.error(`Error adding comment:`, error);
    }
}

/**
 * Handle comment update
 */
async function handleCommentUpdate(event: any, taskId: string, listId: string) {
    const commentId = event.comment?.id;
    if (!commentId) return;

    try {
        // Fetch latest comment from ClickUp
        const commentsData = await clickupClient.getComments(taskId);
        const comment = commentsData.comments.find(c => c.id === commentId);

        if (!comment) {
            console.error(`Comment not found: ${commentId}`);
            return;
        }

        const { error } = await supabaseAdmin
            .from('comments_CAG_custom')
            .update({
                text: comment.comment_text || (comment.comment && comment.comment[0]?.text) || null,
                comment_text: comment.comment_text || null,
                resolved: comment.resolved || false,
                assignee: comment.assignee || null,
                assigned_by: comment.assigned_by || null,
                reactions: comment.reactions || [],
                updated_at: new Date().toISOString(),
            })
            .eq('clickup_id', commentId);

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
async function handleCommentDelete(event: any, taskId: string, listId: string) {
    const commentId = event.comment?.id;
    if (!commentId) return;

    try {
        const { error } = await supabaseAdmin
            .from('comments_CAG_custom')
            .delete()
            .eq('clickup_id', commentId);

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
async function updateWebhookTimestamp(clickupListId: string) {
    try {
        // Get internal list ID
        const { data: list } = await supabaseAdmin
            .from('lists_CAG_custom')
            .select('id')
            .eq('clickup_list_id', clickupListId)
            .single();

        if (!list) return;

        await supabaseAdmin
            .from('webhooks_CAG_custom')
            .update({ last_event_at: new Date().toISOString() })
            .eq('list_id', list.id);

        // Also update the list's last_synced timestamp so the UI reflects recent activity
        await supabaseAdmin
            .from('lists_CAG_custom')
            .update({ last_synced: new Date().toISOString() })
            .eq('id', list.id);
    } catch (error) {
        console.error('Error updating webhook timestamp:', error);
    }
}

