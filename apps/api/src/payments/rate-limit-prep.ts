/**
 * Phase 5: rate limiting is enforced in foundation/rate-limit.ts.
 * This module re-exports for Phase 4 route compatibility.
 */
export {rateLimit as rateLimitPrep, rateLimit, RATE_LIMIT_PLAN, resetRateLimitCounters} from '../foundation/rate-limit.js';
export type {RateLimitBucket} from '../foundation/rate-limit.js';
