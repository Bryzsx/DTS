import type { Context, Next } from "hono"
import { redis } from "./redis.js"
import { createLogger } from "./logger.js"

const log = createLogger("rate-limit")

// ---------------------------------------------------------------------------
// In-memory fallback (per-Vercel-instance, used when Redis is not configured)
// ---------------------------------------------------------------------------

interface Bucket {
  count: number
  resetAt: number
}

const buckets = new Map<string, Bucket>()

const CLEANUP_MS = 60_000
if (typeof setInterval === "function") {
  const timer = setInterval(() => {
    const now = Date.now()
    for (const [key, bucket] of buckets) {
      if (now > bucket.resetAt) buckets.delete(key)
    }
  }, CLEANUP_MS)
  timer.unref?.()
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

export function clientIp(c: Context): string {
  const fwd = c.req.header("x-forwarded-for")
  if (fwd) return fwd.split(",")[0]!.trim()
  return c.req.header("x-real-ip") || "unknown"
}

interface RateLimitOptions {
  windowMs: number
  max: number
  keyOf: (c: Context) => string | Promise<string>
  message?: string
}

// ---------------------------------------------------------------------------
// Rate-limit middleware
//
// When UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN are set the counter
// lives in Upstash Redis and is shared across all Vercel server instances.
// Otherwise it falls back to the in-memory bucket above (per-instance only).
//
// Algorithm (both paths): fixed-window.  First request creates the key with
// an EXPIRE of windowMs; subsequent requests INCR the counter until the
// window expires.  A 429 with Retry-After is returned when the counter
// exceeds opts.max.
// ---------------------------------------------------------------------------

export function rateLimit(opts: RateLimitOptions) {
  return async (c: Context, next: Next) => {
    const key = `rl:${c.req.path}|${await opts.keyOf(c)}`

    // ── Redis path ──────────────────────────────────────────────────────
    if (redis) {
      try {
        const count = await redis.incr(key)
        if (count === 1) {
          // First hit in this window — set the TTL.
          await redis.expire(key, Math.ceil(opts.windowMs / 1000))
        }

        if (count > opts.max) {
          const ttl = await redis.pttl(key) // remaining ms, -1 = no expiry, -2 = missing
          const retryAfter = Math.max(1, Math.ceil((ttl > 0 ? ttl : opts.windowMs) / 1000))
          c.header("Retry-After", String(retryAfter))
          return c.json(
            { error: opts.message || "Too many requests. Please try again shortly." },
            429,
          )
        }

        return next()
      } catch (err) {
        // Redis outage — fail open so users aren't locked out.
        log.error("Redis error, falling back to allow:", err)
        return next()
      }
    }

    // ── In-memory fallback (dev / no Redis configured) ──────────────────
    const now = Date.now()
    const bucket = buckets.get(key)

    if (!bucket || now > bucket.resetAt) {
      buckets.set(key, { count: 1, resetAt: now + opts.windowMs })
      return next()
    }

    if (bucket.count >= opts.max) {
      const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))
      c.header("Retry-After", String(retryAfter))
      return c.json({ error: opts.message || "Too many requests. Please try again shortly." }, 429)
    }

    bucket.count += 1
    return next()
  }
}

export function resetRateLimits() {
  buckets.clear()
}
