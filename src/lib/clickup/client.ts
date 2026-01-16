import { clickupRateLimiter, clickupMinuteRateLimiter } from '../utils/rate-limiter';

const CLICKUP_API_TOKEN = process.env.CLICKUP_API_TOKEN!;
const CLICKUP_BASE_URL = 'https://api.clickup.com/api/v2';

/**
 * ClickUp API client with rate limiting and error handling
 * ClickUp rate limits: 100 requests per minute per workspace
 */
export class ClickUpClient {
    private async fetch<T>(
        endpoint: string,
        options: RequestInit = {}
    ): Promise<T> {
        // Wait for rate limit slots
        await clickupRateLimiter.waitForSlot('clickup-api');
        await clickupMinuteRateLimiter.waitForSlot('clickup-api-minute');

        const response = await fetch(`${CLICKUP_BASE_URL}${endpoint}`, {
            ...options,
            headers: {
                'Authorization': CLICKUP_API_TOKEN,
                'Content-Type': 'application/json',
                ...options.headers,
            },
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(
                `ClickUp API error: ${response.status} ${response.statusText} - ${error}`
            );
        }

        return response.json();
    }

    /**
     * Extract list ID from ClickUp URL
     * Supports formats:
     * - https://app.clickup.com/{workspaceId}/v/l/{viewId}?pr=... (view URL - need to get list from view)
     * - https://app.clickup.com/{workspaceId}/v/li/{listId}/... (direct list URL)
     * - https://app.clickup.com/{workspaceId}/v/li/{listId} (direct list URL)
     * - Just {listId}
     */
    extractListId(urlOrId: string): string {
        // Try direct list format: /v/l/li/{listId}, /v/li/{listId} or /li/{listId}
        let match = urlOrId.match(/\/v\/l\/li\/([^\/\?]+)/) || urlOrId.match(/\/v\/li\/([^\/\?]+)/) || urlOrId.match(/\/li\/([^\/\?]+)/);
        if (match) {
            return match[1];
        }
        // If it's a view URL (/v/l/), return the view ID - we'll need to get list from view
        match = urlOrId.match(/\/v\/l\/([^\/\?]+)/);
        if (match) {
            return match[1]; // This is actually a view ID, will be handled in sync
        }
        // If no match, assume it's already a list ID
        return urlOrId;
    }

    /**
     * Extract folder ID from ClickUp URL
     * Supports formats:
     * - https://app.clickup.com/{workspaceId}/v/o/f/{folderId}...
     * - https://app.clickup.com/{workspaceId}/f/{folderId}...
     */
    extractFolderId(urlOrId: string): string | null {
        const match = urlOrId.match(/\/v\/o\/f\/([^\/\?]+)/) || urlOrId.match(/\/f\/([^\/\?]+)/);
        return match ? match[1] : null;
    }

    /**
     * Get list ID from a view ID
     * When URL contains /v/l/{viewId}, we need to get the list from the view
     */
    async getListIdFromView(viewId: string): Promise<string | null> {
        try {
            // Try to get view details - ClickUp API endpoint for views
            const view = await this.fetch<any>(`/view/${viewId}`);
            // View object typically has a parent (list) reference
            if (view.parent?.id) {
                return view.parent.id;
            }
            // Alternative: view might have list_id directly
            if (view.list_id) {
                return view.list_id;
            }
            return null;
        } catch (error) {
            console.error('Error getting list from view:', error);
            return null;
        }
    }

    /**
     * Extract space ID from ClickUp URL
     */
    extractSpaceId(urlOrId: string): string {
        const match = urlOrId.match(/\/spaces\/([^\/\?]+)/);
        return match ? match[1] : urlOrId;
    }

    /**
     * Get workspace information
     */
    async getWorkspaces() {
        return this.fetch<{ teams: ClickUpWorkspace[] }>('/team');
    }

    /**
     * Get space metadata
     */
    async getSpace(spaceId: string) {
        return this.fetch<ClickUpSpace>(`/space/${spaceId}`);
    }

    /**
     * Get all spaces in a workspace
     */
    async getSpaces(workspaceId: string) {
        return this.fetch<{ spaces: ClickUpSpace[] }>(`/team/${workspaceId}/space`);
    }

    /**
     * Get all folders in a space
     */
    async getFolders(spaceId: string) {
        return this.fetch<{ folders: ClickUpFolder[] }>(`/space/${spaceId}/folder`);
    }

    /**
     * Get all lists in a space (including lists not in folders)
     */
    async getLists(spaceId: string, archived: boolean = false) {
        return this.fetch<{ lists: ClickUpList[] }>(`/space/${spaceId}/list?archived=${archived}`);
    }

    /**
     * Get all lists in a folder
     */
    async getFolderLists(folderId: string, archived: boolean = false) {
        return this.fetch<{ lists: ClickUpList[] }>(`/folder/${folderId}/list?archived=${archived}`);
    }

    /**
     * Get a single list by ID
     */
    async getList(listId: string) {
        return this.fetch<ClickUpList>(`/list/${listId}`);
    }

    /**
     * Get all tasks for a list with full details
     * Handles pagination to fetch all tasks
     */
    async getTasks(listId: string, archived: boolean = false): Promise<{ tasks: ClickUpTask[] }> {
        const allTasks: ClickUpTask[] = [];
        let page = 0;
        let hasMore = true;

        while (hasMore) {
            const response = await this.fetch<{ tasks: ClickUpTask[] }>(
                `/list/${listId}/task?archived=${archived}&include_markdown_description=true&subtasks=true&page=${page}`
            );

            if (response.tasks && response.tasks.length > 0) {
                allTasks.push(...response.tasks);
                // ClickUp API typically returns 100 tasks per page
                // If we got less than 100, we've reached the end
                if (response.tasks.length < 100) {
                    hasMore = false;
                } else {
                    page++;
                }
            } else {
                hasMore = false;
            }
        }

        console.log(`Fetched ${allTasks.length} total tasks (including subtasks) from list ${listId}`);
        return { tasks: allTasks };
    }

    /**
     * Get a single task by ID with full details
     */
    async getTask(taskId: string) {
        return this.fetch<ClickUpTask>(
            `/task/${taskId}?include_markdown_description=true&subtasks=true`
        );
    }

    /**
     * Get all comments for a task
     */
    async getComments(taskId: string) {
        return this.fetch<{ comments: ClickUpComment[] }>(`/task/${taskId}/comment`);
    }

    /**
     * Create a webhook for a list
     */
    async createWebhook(listId: string, callbackUrl: string, events: string[] = ['taskCreated', 'taskUpdated', 'taskDeleted', 'taskCommentPosted', 'taskCommentUpdated', 'taskCommentDeleted']) {
        const webhookData: any = {
            webhook: {
                endpoint: callbackUrl,
                events: events,
                task_id: null,
                list_id: listId,
                folder_id: null,
                space_id: null,
                health: {
                    status: 'active',
                    fail_count: 0,
                },
            },
        };

        // Client ID is optional - only include if provided
        if (process.env.CLICKUP_CLIENT_ID) {
            webhookData.webhook.client_id = process.env.CLICKUP_CLIENT_ID;
        }

        return this.fetch<ClickUpWebhook>('/webhook', {
            method: 'POST',
            body: JSON.stringify(webhookData),
        });
    }

    /**
     * Delete a webhook
     */
    async deleteWebhook(webhookId: string) {
        return this.fetch(`/webhook/${webhookId}`, {
            method: 'DELETE',
        });
    }

    /**
     * Get webhook details
     */
    async getWebhook(webhookId: string) {
        return this.fetch<ClickUpWebhook>(`/webhook/${webhookId}`);
    }

    /**
     * Get all webhooks for a team
     */
    async getWebhooks(workspaceId: string) {
        return this.fetch<{ webhooks: ClickUpWebhook[] }>(`/team/${workspaceId}/webhook`);
    }

    /**
     * Verify webhook signature from ClickUp
     * ClickUp sends webhook signature in X-Signature header
     */
    verifyWebhookSignature(
        payload: string,
        signature: string
    ): boolean {
        if (!process.env.CLICKUP_WEBHOOK_SECRET) {
            console.warn('CLICKUP_WEBHOOK_SECRET not set, skipping signature verification');
            return true; // Allow in development
        }

        // ClickUp uses HMAC-SHA256 with the webhook secret
        const crypto = require('crypto');
        const hmac = crypto.createHmac('sha256', process.env.CLICKUP_WEBHOOK_SECRET);
        hmac.update(payload);
        const digest = hmac.digest('hex');

        return digest === signature;
    }
}

// Type definitions for ClickUp API responses
export interface ClickUpWorkspace {
    id: string;
    name: string;
    color?: string;
    avatar?: string;
    members?: any[];
}

export interface ClickUpSpace {
    id: string;
    name: string;
    private: boolean;
    color?: string;
    avatar?: string;
    multiple_assignees?: boolean;
    features?: any;
    archived?: boolean;
}

export interface ClickUpFolder {
    id: string;
    name: string;
    orderindex: number;
    override_statuses?: boolean;
    hidden?: boolean;
    space: {
        id: string;
        name: string;
    };
    task_count?: string;
    archived?: boolean;
    statuses?: any[];
    lists?: ClickUpList[];
}

export interface ClickUpList {
    id: string;
    name: string;
    orderindex: number;
    status?: {
        status: string;
        color: string;
        hide_label: boolean;
    };
    priority?: {
        priority: string;
        color: string;
    };
    assignee?: any;
    task_count?: number;
    due_date?: string;
    due_date_time?: boolean;
    start_date?: string;
    start_date_time?: boolean;
    folder: {
        id: string;
        name: string;
        hidden: boolean;
        access: boolean;
    };
    space: {
        id: string;
        name: string;
        access: boolean;
    };
    archived: boolean;
    statuses?: any[];
    permission_level: string;
}

export interface ClickUpTask {
    id: string;
    custom_id?: string;
    name: string;
    text_content?: string;
    description?: string;
    status: {
        status: string;
        color: string;
        type: string;
        orderindex: number;
    };
    orderindex: string;
    date_created: string;
    date_updated: string;
    date_closed?: string;
    date_done?: string;
    archived: boolean;
    creator: {
        id: string;
        username: string;
        color?: string;
        email?: string;
        profilePicture?: string;
    };
    assignees: Array<{
        id: string;
        username: string;
        color?: string;
        initials?: string;
        email?: string;
        profilePicture?: string;
    }>;
    watchers: Array<{
        id: string;
        username: string;
        color?: string;
        initials?: string;
        email?: string;
        profilePicture?: string;
    }>;
    checklists?: Array<{
        id: string;
        task_id: string;
        name: string;
        date_created: string;
        orderindex: number;
        creator: any;
        resolved: number;
        unresolved: number;
        items: any[];
    }>;
    tags: Array<{
        name: string;
        tag_fg: string;
        tag_bg: string;
        creator?: number;
    }>;
    parent?: string;
    priority?: {
        id: string;
        priority: string;
        color: string;
        orderindex: string;
    };
    due_date?: string;
    start_date?: string;
    points?: number;
    time_estimate?: number;
    time_spent?: number;
    custom_fields?: any[];
    dependencies?: any[];
    linked_tasks?: any[];
    team_id: string;
    url: string;
    sharing?: {
        public: boolean;
        public_share_expires_on?: string;
        public_fields: string[];
        token?: string;
        seo_optimized?: boolean;
    };
    permission_level: string;
    list: {
        id: string;
        name: string;
        access: boolean;
    };
    project: {
        id: string;
        name: string;
        hidden: boolean;
        access: boolean;
    };
    folder: {
        id: string;
        name: string;
        hidden: boolean;
        access: boolean;
    };
    space: {
        id: string;
    };
}

export interface ClickUpComment {
    id: string;
    comment: Array<{
        text: string;
    }>;
    comment_text: string;
    user: {
        id: string;
        username: string;
        color?: string;
        email?: string;
        profilePicture?: string;
    };
    resolved: boolean;
    assignee?: any;
    assigned_by?: any;
    reactions: any[];
    date: string;
}

export interface ClickUpWebhook {
    id: string;
    webhook: {
        id: string;
        userid: number;
        team_id: number;
        endpoint: string;
        client_id: string;
        events: string[];
        task_id?: string;
        list_id?: string;
        folder_id?: string;
        space_id?: string;
        health: {
            status: string;
            fail_count: number;
        };
    };
}

// Export singleton instance
export const clickupClient = new ClickUpClient();

