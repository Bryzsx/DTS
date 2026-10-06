import type { Context } from "hono"
import { db } from "../db/index.js"
import { auditLogs } from "../db/schema.js"
import { clientIp } from "./rate-limit.js"
import { createLogger } from "./logger.js"

const log = createLogger("audit")

interface AuditOptions {
  userId?: number
  entity?: string
  entityId?: string | number
  detail?: Record<string, unknown>
}

/**
 * Writes a security-relevant event to audit_logs. Fire-and-forget: failures
 * are swallowed so a logging hiccup never breaks a request.
 */
export function logAudit(c: Context, action: string, opts: AuditOptions = {}) {
  db.insert(auditLogs)
    .values({
  // @ts-ignore - Drizzle insert type misses userId
      userId: opts.userId ?? null,
      action,
      entity: opts.entity ?? null,
      entityId: opts.entityId != null ? String(opts.entityId) : null,
      ip: clientIp(c),
      userAgent: c.req.header("user-agent")?.slice(0, 300) ?? null,
      detail: opts.detail ?? null,
    })
    .catch((err) => log.error("audit log failed:", err))
}

