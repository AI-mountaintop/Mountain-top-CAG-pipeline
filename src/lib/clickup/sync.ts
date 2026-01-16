import { clickupClient } from './client';
import { supabaseAdmin } from '../supabase/client';

const WEBHOOK_CALLBACK_URL = process.env.CLICKUP_WEBHOOK_CALLBACK_URL!;

/**
 * Sync a ClickUp list to the database
 * Performs initial data ingestion: list metadata and tasks
 */
export async function syncList(listUrl: string) {
    try {
        console.log(`Starting sync for list: ${listUrl}`);

        // Extract ID from URL (could be list ID or view ID)
        let extractedId = clickupClient.extractListId(listUrl);

        // Check if it's a view URL (contains /v/l/ but NOT /v/l/li/)
        let listId = extractedId;
        if (listUrl.includes('/v/l/') && !listUrl.includes('/v/l/li/')) {
            console.log(`Detected view URL, extracting list ID from view: ${extractedId}`);

            // Parse the view ID format: typically {type}-{listId}-{instance}
            // Example: "6-901413066208-1" where listId might be "901413066208"
            const parts = extractedId.split('-');

            // Try different parsing strategies
            const candidates = [];

            if (parts.length >= 3) {
                // Strategy 1: Middle part only (most common)
                candidates.push(parts.slice(1, -1).join('-'));
                // Strategy 2: Everything after first dash
                candidates.push(parts.slice(1).join('-'));
            }

            // Strategy 3: Try to get from view API
            try {
                const listIdFromView = await clickupClient.getListIdFromView(extractedId);
                if (listIdFromView) {
                    candidates.unshift(listIdFromView); // Prioritize API result
                }
            } catch (e) {
                console.log('Could not get list ID from view API');
            }

            // Try each candidate until one works
            let found = false;
            for (const candidate of candidates) {
                try {
                    console.log(`Trying list ID candidate: ${candidate}`);
                    await clickupClient.getList(candidate);
                    listId = candidate;
                    console.log(`✅ Successfully validated list ID: ${listId}`);
                    found = true;
                    break;
                } catch (e: any) {
                    console.log(`❌ Candidate ${candidate} failed: ${e.message}`);
                    continue;
                }
            }

            if (!found) {
                throw new Error(`Could not determine list ID from view URL. Tried: ${candidates.join(', ')}`);
            }
        }

        // 1. Fetch and upsert list metadata
        const listData = await clickupClient.getList(listId);

        // Get workspace and space info
        const spaceId = listData.space.id;
        const spaceData = await clickupClient.getSpace(spaceId);

        // Get workspace info (we need to get it from teams)
        const workspaces = await clickupClient.getWorkspaces();
        const workspace = workspaces.teams[0]; // Usually there's one workspace per API token

        const { data: list, error: listError } = await supabaseAdmin
            .from('lists_CAG_custom')
            .upsert(
                {
                    clickup_list_id: listData.id,
                    name: listData.name,
                    url: listUrl,
                    description: null, // ClickUp lists don't have descriptions
                    space_id: spaceData.id,
                    space_name: spaceData.name,
                    folder_id: listData.folder?.id || null,
                    folder_name: listData.folder?.name || null,
                    workspace_id: workspace.id,
                    workspace_name: workspace.name,
                    orderindex: listData.orderindex || null,
                    statuses: listData.statuses || [],
                    permission_level: listData.permission_level || null,
                    is_archived: listData.archived || false,
                    task_count: listData.task_count || null,
                    last_synced: new Date().toISOString(),
                },
                { onConflict: 'clickup_list_id' }
            )
            .select()
            .single();

        if (listError) {
            throw new Error(`Failed to upsert list: ${listError.message}`);
        }

        console.log(`List synced: ${list.name} (${list.id})`);

        // 2. Fetch and upsert all tasks (with pagination to get all tasks)
        const tasksData = await clickupClient.getTasks(listId);

        // Count parent tasks vs subtasks for logging
        const parentTasks = tasksData.tasks.filter(task => !task.parent);
        const subtasks = tasksData.tasks.filter(task => task.parent);

        console.log(`Total tasks fetched: ${tasksData.tasks.length}`);
        console.log(`Parent tasks: ${parentTasks.length}`);
        console.log(`Subtasks: ${subtasks.length}`);

        // Include all tasks (both parent and subtasks) with ALL ClickUp fields
        const tasksToUpsert = tasksData.tasks.map((task) => ({
            list_id: list.id,
            clickup_task_id: task.id,
            custom_id: task.custom_id || null,
            name: task.name,
            description: task.description || null,
            text_content: task.text_content || null,
            position: parseFloat(task.orderindex) || 0,
            orderindex: task.orderindex || null, // Raw orderindex string

            // Dates
            due_date: task.due_date ? new Date(parseInt(task.due_date)).toISOString() : null,
            start_date: task.start_date ? new Date(parseInt(task.start_date)).toISOString() : null,
            date_closed: task.date_closed ? new Date(task.date_closed).toISOString() : null,
            date_done: task.date_done ? new Date(task.date_done).toISOString() : null,
            date_created: task.date_created ? new Date(parseInt(task.date_created)).toISOString() : null,
            date_updated: task.date_updated ? new Date(parseInt(task.date_updated)).toISOString() : null,

            // Status
            is_archived: task.archived || false,
            status: task.status?.status || null,
            status_color: task.status?.color || null,
            status_type: task.status?.type || null,
            status_orderindex: task.status?.orderindex || null,

            // Priority
            priority: task.priority?.priority || null,
            priority_color: task.priority?.color || null,
            priority_id: task.priority?.id || null,
            priority_orderindex: task.priority?.orderindex || null,

            // Relationships
            parent_task_id: task.parent || null,
            dependencies: task.dependencies || [],
            linked_tasks: task.linked_tasks || [],

            // Team and permissions
            team_id: task.team_id || null,
            permission_level: task.permission_level || null,

            // Sharing
            sharing: task.sharing || {},

            // JSONB fields
            tags: task.tags || [],
            assignees: task.assignees || [],
            watchers: task.watchers || [],
            checklists: task.checklists || [],
            custom_fields: task.custom_fields || [],
            creator: task.creator || {},

            // Context information
            list_info: task.list || {},
            project_info: task.project || {},
            folder_info: task.folder || {},
            space_info: task.space || {},

            // Time tracking
            time_estimate: task.time_estimate || null,
            time_spent: task.time_spent || null,
            points: task.points || null,

            // URL
            url: task.url,
        }));

        // Batch upsert tasks (Supabase has a limit, so chunk if needed)
        const BATCH_SIZE = 100;
        for (let i = 0; i < tasksToUpsert.length; i += BATCH_SIZE) {
            const batch = tasksToUpsert.slice(i, i + BATCH_SIZE);
            const { error: tasksError } = await supabaseAdmin
                .from('tasks_CAG_custom')
                .upsert(batch, { onConflict: 'clickup_task_id' });

            if (tasksError) {
                throw new Error(
                    `Failed to upsert tasks (batch ${i / BATCH_SIZE + 1}): ${tasksError.message}`
                );
            }
        }

        console.log(`Synced ${tasksToUpsert.length} tasks`);

        // 3. Fetch and upsert comments for all tasks
        // SKIP for now to avoid rate limits and timeouts during initial sync
        console.log('Skipping comment sync for performance...');
        /*
        console.log('Fetching comments...');
        let totalComments = 0;

        for (const task of tasksData.tasks) {
            try {
                const commentsData = await clickupClient.getComments(task.id);
                
                // Get internal task ID
                const { data: internalTask } = await supabaseAdmin
                    .from('tasks_CAG_custom')
                    .select('id')
                    .eq('clickup_task_id', task.id)
                    .single();

                if (!internalTask) continue;

                const commentsToUpsert = commentsData.comments.map((comment) => ({
                    task_id: internalTask.id,
                    clickup_id: comment.id,
                    text: comment.comment_text || (comment.comment && comment.comment[0]?.text) || null,
                    comment_text: comment.comment_text || null,
                    user: comment.user || {},
                    resolved: comment.resolved || false,
                    assignee: comment.assignee || null,
                    assigned_by: comment.assigned_by || null,
                    reactions: comment.reactions || [],
                    date: comment.date ? new Date(parseInt(comment.date)).toISOString() : new Date().toISOString(),
                }));

                if (commentsToUpsert.length > 0) {
                    const { error: commentsError } = await supabaseAdmin
                        .from('comments_CAG_custom')
                        .upsert(commentsToUpsert, { onConflict: 'clickup_id' });

                    if (commentsError) {
                        console.error(`Failed to upsert comments for task ${task.id}:`, commentsError);
                    } else {
                        totalComments += commentsToUpsert.length;
                    }
                }
            } catch (error) {
                console.error(`Error fetching comments for task ${task.id}:`, error);
                // Continue with other tasks
            }
        }

        if (totalComments > 0) {
            console.log(`Synced ${totalComments} comments`);
        } else {
            console.log('No comments to sync');
        }
        */
        const totalComments = 0;

        // 4. Register webhook if not already registered
        await registerWebhook(list.id, listData.id);

        console.log(`Sync completed for list: ${list.name}`);

        return {
            success: true,
            list,
            stats: {
                tasks: tasksToUpsert.length,
                comments: totalComments,
            },
        };
    } catch (error) {
        console.error('Sync error:', error);
        throw error;
    }
}

/**
 * Sync a ClickUp folder (all lists within it)
 */
export async function syncFolder(folderUrl: string) {
    try {
        console.log(`Starting sync for folder: ${folderUrl}`);
        const folderId = clickupClient.extractFolderId(folderUrl);

        if (!folderId) {
            throw new Error('Could not extract folder ID from URL');
        }

        const { lists } = await clickupClient.getFolderLists(folderId);
        console.log(`Found ${lists.length} lists in folder ${folderId}`);

        const results = [];
        for (const list of lists) {
            // Construct a list URL for syncing (optional, but good for metadata)
            // We can just pass the ID to syncList if we modify it, but syncList expects a URL or ID?
            // syncList takes a URL and extracts ID. If we pass ID, it works.
            try {
                const result = await syncList(list.id);
                results.push(result);
            } catch (error) {
                console.error(`Failed to sync list ${list.name} (${list.id}):`, error);
            }
        }

        return {
            success: true,
            folderId,
            syncedLists: results
        };
    } catch (error) {
        console.error('Folder sync error:', error);
        throw error;
    }
};

/**
 * Register a webhook for a list if not already registered
 */
async function registerWebhook(internalListId: string, clickupListId: string) {
    if (!WEBHOOK_CALLBACK_URL) {
        console.warn('CLICKUP_WEBHOOK_CALLBACK_URL not set, skipping webhook registration');
        return;
    }

    // Check if webhook already exists
    const { data: existingWebhook } = await supabaseAdmin
        .from('webhooks_CAG_custom')
        .select('*')
        .eq('list_id', internalListId)
        .eq('is_active', true)
        .single();

    if (existingWebhook) {
        console.log(`Webhook already registered for list ${internalListId}`);
        return;
    }

    try {
        // Create webhook in ClickUp
        console.log(`Creating webhook for list ${clickupListId} with callback ${WEBHOOK_CALLBACK_URL}`);
        const webhook = await clickupClient.createWebhook(
            clickupListId,
            WEBHOOK_CALLBACK_URL
        );

        console.log(`ClickUp webhook created successfully:`, webhook);

        // Store webhook info in database
        const webhookId = webhook.webhook?.id || webhook.id;
        const { error } = await supabaseAdmin.from('webhooks_CAG_custom').insert({
            list_id: internalListId,
            clickup_webhook_id: webhookId,
            callback_url: WEBHOOK_CALLBACK_URL,
            is_active: true,
        });

        if (error) {
            throw new Error(`Failed to store webhook: ${error.message}`);
        }

        console.log(`✅ Webhook registered successfully: ${webhookId}`);
    } catch (error: any) {
        console.error('❌ Webhook registration error:');
        console.error('Error message:', error.message);
        console.error('Error details:', JSON.stringify(error, null, 2));
        console.error('Full error:', error);
        // Don't fail the entire sync if webhook registration fails
    }
}

/**
 * Delete a list and all its data
 */
export async function deleteList(listId: string) {
    try {
        // Get webhooks for this list
        const { data: webhooks } = await supabaseAdmin
            .from('webhooks_CAG_custom')
            .select('clickup_webhook_id')
            .eq('list_id', listId);

        // Delete webhooks from ClickUp
        if (webhooks) {
            for (const webhook of webhooks) {
                try {
                    await clickupClient.deleteWebhook(webhook.clickup_webhook_id);
                } catch (error) {
                    console.error(`Failed to delete webhook ${webhook.clickup_webhook_id}:`, error);
                }
            }
        }

        // Delete list (cascades to tasks, comments, webhooks)
        const { error } = await supabaseAdmin
            .from('lists_CAG_custom')
            .delete()
            .eq('id', listId);

        if (error) {
            throw new Error(`Failed to delete list: ${error.message}`);
        }

        return { success: true };
    } catch (error) {
        console.error('Delete list error:', error);
        throw error;
    }
}

/**
 * Delete a folder (all lists within it)
 */
export async function deleteFolder(folderId: string) {
    try {
        // 1. Get all lists in this folder
        const { data: lists } = await supabaseAdmin
            .from('lists_CAG_custom')
            .select('id')
            .eq('folder_id', folderId);

        if (!lists || lists.length === 0) {
            console.log(`No lists found for folder ${folderId}`);
            return { success: true };
        }

        console.log(`Deleting ${lists.length} lists in folder ${folderId}`);

        // 2. Delete each list (using deleteList to handle webhooks etc)
        for (const list of lists) {
            try {
                await deleteList(list.id);
            } catch (error) {
                console.error(`Failed to delete list ${list.id} in folder ${folderId}:`, error);
                // Continue deleting others
            }
        }

        return { success: true };
    } catch (error) {
        console.error('Delete folder error:', error);
        throw error;
    }
}

