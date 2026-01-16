/**
 * Authentication and Rate Limiting for Experiments API
 * 
 * This module provides:
 * - API key validation for Colab requests
 * - Rate limiting to prevent abuse
 */

// ============================================================================
// API Key Validation
// ============================================================================

/**
 * Validate an API key for experiment tracking requests
 * 
 * API keys should be stored in environment variables.
 * For production, consider using a database or secret manager.
 */
export async function validateApiKey(apiKey: string): Promise<boolean> {
  // Get valid API keys from environment
  const validApiKeys = process.env.EXPERIMENT_API_KEYS?.split(',') || [];
  
  // Also check for a single API key (backward compatibility)
  const singleKey = process.env.EXPERIMENT_API_KEY;
  if (singleKey) {
    validApiKeys.push(singleKey);
  }

  // Check if the provided key matches any valid key
  return validApiKeys.some(key => key.trim() === apiKey);
}

// ============================================================================
// Rate Limiting
// ============================================================================

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

// In-memory rate limit store (in production, use Redis or similar)
const rateLimitStore = new Map<string, RateLimitEntry>();

// Rate limit configuration
const RATE_LIMITS = {
  create: {
    maxRequests: 100,      // 100 experiments per window
    windowMs: 3600000,     // 1 hour window
  },
  list: {
    maxRequests: 1000,     // 1000 list requests per window  
    windowMs: 3600000,     // 1 hour window
  },
  metrics: {
    maxRequests: 10000,    // 10000 metric logs per window (batch-friendly)
    windowMs: 3600000,     // 1 hour window
  },
  update: {
    maxRequests: 500,      // 500 updates per window
    windowMs: 3600000,     // 1 hour window
  },
};

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfter?: number;
}

/**
 * Check rate limit for a client and operation type
 */
export async function checkRateLimit(
  clientId: string,
  operation: keyof typeof RATE_LIMITS
): Promise<RateLimitResult> {
  const config = RATE_LIMITS[operation];
  const key = `${clientId}:${operation}`;
  const now = Date.now();

  let entry = rateLimitStore.get(key);

  // Clean up or initialize entry
  if (!entry || now - entry.windowStart > config.windowMs) {
    entry = {
      count: 0,
      windowStart: now,
    };
    rateLimitStore.set(key, entry);
  }

  // Check if limit exceeded
  if (entry.count >= config.maxRequests) {
    const retryAfter = Math.ceil((entry.windowStart + config.windowMs - now) / 1000);
    return {
      allowed: false,
      remaining: 0,
      retryAfter,
    };
  }

  // Increment counter
  entry.count++;
  
  return {
    allowed: true,
    remaining: config.maxRequests - entry.count,
  };
}

/**
 * Reset rate limit for a client (useful for testing)
 */
export function resetRateLimit(clientId: string, operation?: keyof typeof RATE_LIMITS): void {
  if (operation) {
    rateLimitStore.delete(`${clientId}:${operation}`);
  } else {
    // Reset all operations for this client
    for (const op of Object.keys(RATE_LIMITS)) {
      rateLimitStore.delete(`${clientId}:${op}`);
    }
  }
}

/**
 * Get rate limit status for a client
 */
export function getRateLimitStatus(
  clientId: string,
  operation: keyof typeof RATE_LIMITS
): { remaining: number; resetIn: number } {
  const config = RATE_LIMITS[operation];
  const key = `${clientId}:${operation}`;
  const now = Date.now();
  
  const entry = rateLimitStore.get(key);
  
  if (!entry || now - entry.windowStart > config.windowMs) {
    return {
      remaining: config.maxRequests,
      resetIn: config.windowMs / 1000,
    };
  }

  return {
    remaining: Math.max(0, config.maxRequests - entry.count),
    resetIn: Math.ceil((entry.windowStart + config.windowMs - now) / 1000),
  };
}

// ============================================================================
// Cleanup (for long-running servers)
// ============================================================================

// Periodically clean up old rate limit entries (every 10 minutes)
const CLEANUP_INTERVAL = 600000;

let cleanupTimer: NodeJS.Timeout | null = null;

export function startRateLimitCleanup(): void {
  if (cleanupTimer) return;
  
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    const maxWindowMs = Math.max(...Object.values(RATE_LIMITS).map(r => r.windowMs));
    
    for (const [key, entry] of rateLimitStore.entries()) {
      if (now - entry.windowStart > maxWindowMs * 2) {
        rateLimitStore.delete(key);
      }
    }
  }, CLEANUP_INTERVAL);
}

export function stopRateLimitCleanup(): void {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
}

// Auto-start cleanup in non-edge environments
if (typeof window === 'undefined' && process.env.NODE_ENV !== 'test') {
  startRateLimitCleanup();
}
