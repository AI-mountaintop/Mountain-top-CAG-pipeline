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
     * @param key Identifier for the rate limit bucket (e.g., 'clickup-api')
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

// Pre-configured rate limiters for ClickUp API
// ClickUp limits: 100 requests per minute per workspace
export const clickupRateLimiter = new RateLimiter(100, 60 * 1000); // 100 per minute
export const clickupMinuteRateLimiter = new RateLimiter(100, 60 * 1000); // Same limit for consistency

// OpenAI rate limiter
// OpenAI limits: ~30,000 tokens per minute for gpt-4o
// We'll be conservative: limit to ~20 requests per minute (assuming ~1500 tokens per request)
// Also add a per-second limiter to avoid bursts
export const openaiRateLimiter = new RateLimiter(20, 60 * 1000); // 20 requests per minute
export const openaiSecondRateLimiter = new RateLimiter(3, 1000); // 3 requests per second max
