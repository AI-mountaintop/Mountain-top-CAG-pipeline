/**
 * Generic rate limiter using sliding window algorithm
 * Configurable for different rate limits (requests per time window)
 */

interface RateLimitConfig {
    maxRequests: number;
    windowMs: number;
}

interface RequestLog {
    timestamp: number;
}

export class RateLimiter {
    private requests: Map<string, RequestLog[]> = new Map();
    private config: RateLimitConfig;

    constructor(maxRequests: number, windowMs: number) {
        this.config = { maxRequests, windowMs };
    }

    /**
     * Check if request is allowed and record it
     * @param key Identifier for the rate limit bucket (e.g., 'trello-api')
     * @returns true if request is allowed, false if rate limited
     */
    async checkLimit(key: string): Promise<boolean> {
        const now = Date.now();
        const windowStart = now - this.config.windowMs;

        // Get existing requests for this key
        let keyRequests = this.requests.get(key) || [];

        // Remove old requests outside the time window
        keyRequests = keyRequests.filter((req) => req.timestamp > windowStart);

        // Check if we're at the limit
        if (keyRequests.length >= this.config.maxRequests) {
            this.requests.set(key, keyRequests);
            return false;
        }

        // Add new request
        keyRequests.push({ timestamp: now });
        this.requests.set(key, keyRequests);

        // Cleanup old keys periodically
        if (Math.random() < 0.01) {
            // 1% chance
            this.cleanup();
        }

        return true;
    }

    /**
     * Wait until a request slot is available
     * @param key Identifier for the rate limit bucket
     */
    async waitForSlot(key: string): Promise<void> {
        while (!(await this.checkLimit(key))) {
            // Wait 100ms before checking again
            await new Promise((resolve) => setTimeout(resolve, 100));
        }
    }

    /**
     * Get time until next available slot in milliseconds
     * @param key Identifier for the rate limit bucket
     */
    getTimeUntilReset(key: string): number {
        const keyRequests = this.requests.get(key) || [];
        if (keyRequests.length === 0) return 0;

        const oldestRequest = keyRequests[0];
        const resetTime = oldestRequest.timestamp + this.config.windowMs;
        return Math.max(0, resetTime - Date.now());
    }

    /**
     * Reset rate limits for a specific key
     * @param key Identifier for the rate limit bucket
     */
    reset(key: string): void {
        this.requests.delete(key);
    }

    /**
     * Clean up old request logs
     */
    private cleanup(): void {
        const now = Date.now();
        const windowStart = now - this.config.windowMs;

        for (const [key, requests] of this.requests.entries()) {
            const activeRequests = requests.filter((req) => req.timestamp > windowStart);
            if (activeRequests.length === 0) {
                this.requests.delete(key);
            } else {
                this.requests.set(key, activeRequests);
            }
        }
    }
}

// Pre-configured rate limiters for Trello API
// Trello limits: 100 requests per 10 seconds, 300 per 5 minutes
export const trelloRateLimiter = new RateLimiter(100, 10 * 1000); // 100 per 10 seconds
export const trelloMinuteRateLimiter = new RateLimiter(300, 5 * 60 * 1000); // 300 per 5 minutes
