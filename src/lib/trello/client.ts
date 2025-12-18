import crypto from 'crypto';
import { trelloRateLimiter, trelloMinuteRateLimiter } from '../utils/rate-limiter';

const TRELLO_API_KEY = process.env.TRELLO_API_KEY!;
const TRELLO_API_TOKEN = process.env.TRELLO_API_TOKEN!;
const TRELLO_API_SECRET = process.env.TRELLO_API_SECRET!;
const TRELLO_BASE_URL = 'https://api.trello.com/1';

/**
 * Trello API client with rate limiting and error handling
 */
export class TrelloClient {
    private async fetch<T>(
        endpoint: string,
        options: RequestInit = {}
    ): Promise<T> {
        // Wait for rate limit slots
        await trelloRateLimiter.waitForSlot('trello-api');
        await trelloMinuteRateLimiter.waitForSlot('trello-api-minute');

        const url = new URL(`${TRELLO_BASE_URL}${endpoint}`);
        url.searchParams.append('key', TRELLO_API_KEY);
        url.searchParams.append('token', TRELLO_API_TOKEN);

        const response = await fetch(url.toString(), {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...options.headers,
            },
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(
                `Trello API error: ${response.status} ${response.statusText} - ${error}`
            );
        }

        return response.json();
    }

    /**
     * Extract board ID from Trello URL
     * Supports formats: https://trello.com/b/{boardId}/... or just {boardId}
     */
    extractBoardId(urlOrId: string): string {
        const match = urlOrId.match(/\/b\/([^\/]+)/);
        return match ? match[1] : urlOrId;
    }

    /**
     * Get board metadata
     */
    async getBoard(boardId: string) {
        return this.fetch<TrelloBoard>(`/boards/${boardId}?fields=all`);
    }

    /**
     * Get all lists for a board
     */
    async getLists(boardId: string) {
        return this.fetch<TrelloList[]>(`/boards/${boardId}/lists?fields=all`);
    }

    /**
     * Get all cards for a board with full details
     */
    async getCards(boardId: string) {
        return this.fetch<TrelloCard[]>(
            `/boards/${boardId}/cards?fields=all&attachments=true&checklists=all&members=true`
        );
    }

    /**
     * Get a single card by ID with full details
     */
    async getCard(cardId: string) {
        return this.fetch<TrelloCard>(
            `/cards/${cardId}?fields=all&attachments=true&checklists=all&members=true`
        );
    }

    /**
     * Get all actions (comments) for a board
     */
    async getActions(boardId: string) {
        return this.fetch<TrelloAction[]>(
            `/boards/${boardId}/actions?filter=commentCard,copyCommentCard&fields=all&memberCreator=true`
        );
    }

    /**
     * Create a webhook for a board
     */
    async createWebhook(boardId: string, callbackUrl: string) {
        return this.fetch<TrelloWebhook>('/webhooks', {
            method: 'POST',
            body: JSON.stringify({
                description: `Trello Intelligence Webhook for ${boardId}`,
                callbackURL: callbackUrl,
                idModel: boardId,
            }),
        });
    }

    /**
     * Delete a webhook
     */
    async deleteWebhook(webhookId: string) {
        return this.fetch(`/webhooks/${webhookId}`, {
            method: 'DELETE',
        });
    }

    /**
     * Get webhook details
     */
    async getWebhook(webhookId: string) {
        return this.fetch<TrelloWebhook>(`/webhooks/${webhookId}`);
    }

    /**
     * Verify webhook signature from Trello
     * Uses HMAC-SHA1 with the API secret
     */
    verifyWebhookSignature(
        payload: string,
        signature: string,
        callbackUrl: string
    ): boolean {
        if (!TRELLO_API_SECRET) {
            console.warn('TRELLO_API_SECRET not set, skipping signature verification');
            return true; // Allow in development
        }

        const hmac = crypto.createHmac('sha1', TRELLO_API_SECRET);
        const content = payload + callbackUrl;
        hmac.update(content);
        const digest = hmac.digest('base64');

        return digest === signature;
    }
}

// Type definitions for Trello API responses
export interface TrelloBoard {
    id: string;
    name: string;
    desc: string;
    url: string;
    closed: boolean;
    prefs: any;
}

export interface TrelloList {
    id: string;
    name: string;
    closed: boolean;
    pos: number;
    idBoard: string;
}

export interface TrelloCard {
    id: string;
    name: string;
    desc: string;
    closed: boolean;
    idList: string;
    idBoard: string;
    pos: number;
    due: string | null;
    dueComplete: boolean;
    labels: Array<{
        id: string;
        idBoard: string;
        name: string;
        color: string;
    }>;
    idMembers: string[];
    members?: Array<{
        id: string;
        username: string;
        fullName: string;
    }>;
    attachments?: any[];
    checklists?: any[];
    url: string;
    dateLastActivity: string;
}

export interface TrelloAction {
    id: string;
    idMemberCreator: string;
    data: {
        text: string;
        card: {
            id: string;
            name: string;
            idShort: number;
            shortLink: string;
        };
        board: {
            id: string;
            name: string;
            shortLink: string;
        };
        list?: {
            id: string;
            name: string;
        };
    };
    type: string;
    date: string;
    memberCreator: {
        id: string;
        username: string;
        fullName: string;
        avatarUrl: string;
    };
}

export interface TrelloWebhook {
    id: string;
    description: string;
    idModel: string;
    callbackURL: string;
    active: boolean;
}

// Export singleton instance
export const trelloClient = new TrelloClient();
