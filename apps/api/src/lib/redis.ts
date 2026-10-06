import { Redis } from "@upstash/redis"

const url = process.env.UPSTASH_REDIS_REST_URL
const token = process.env.UPSTASH_REDIS_REST_TOKEN

// Export a shared Upstash Redis client if configured, otherwise null.
// Without Redis the rate limiter falls back to per-instance in-memory buckets
// (fine for dev / low traffic; upgrade when abuse emerges).
export const redis: Redis | null = url && token ? new Redis({ url, token }) : null
