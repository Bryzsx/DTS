import { Hono } from "hono"
import type { Context } from "hono"
import { HTTPException } from "hono/http-exception"
import { cors } from "hono/cors"
import { logger } from "hono/logger"
import "./lib/sentry.js"
import * as Sentry from "@sentry/node"
import { raw } from "./db/index.js"
import { auth } from "./routes/auth.js"
import { documentsRoute } from "./routes/documents.js"
import { attachments, documentAttachmentsRoute } from "./routes/attachments.js"
import { reports } from "./routes/reports.js"
import { admin as adminUsers } from "./routes/admin.js"
import { admin as adminMeta } from "./routes/admin-meta.js"
import { exportRoutes } from "./routes/export.js"
import { createLogger } from "./lib/logger.js"

const log = createLogger("api")

const app = new Hono()

const DEV_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173"]

function isAllowedOrigin(origin: string | undefined, host: string): boolean {
  if (!origin) return true // non-browser / same-origin
  try {
    const u = new URL(origin)
    if (u.host === host) return true // same-origin
  } catch {
    return false
  }
  const extra = (process.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
  return DEV_ORIGINS.concat(extra).includes(origin)
}

app.use(
  "*",
  cors({
    origin: (origin, c) => {
      if (isAllowedOrigin(origin ?? undefined, c.req.header("host") ?? "")) return origin ?? "*"
      return ""
    },
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    maxAge: 86400,
  }),
)
app.use("*", logger())

app.use("*", async (c, next) => {
  await next()
  c.res.headers.set("X-Content-Type-Options", "nosniff")
  c.res.headers.set("X-Frame-Options", "SAMEORIGIN")
  c.res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin")
  c.res.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  )
  c.res.headers.set("X-Permitted-Cross-Domain-Policies", "none")
  c.res.headers.set("Cross-Origin-Resource-Policy", "same-origin")
  c.res.headers.set(
    "Content-Security-Policy-Report-Only",
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "font-src 'self'",
      "img-src 'self' data: blob:",
      "connect-src 'self'",
      "frame-ancestors 'self'",
      "form-action 'self'",
    ].join("; "),
  )
})

app.get("/", (c) => c.json({ service: "dts-api", health: "/api/health" }))

/**
 * Liveness plus a real dependency check. A health probe that answers 200 without
 * touching the database hides broken migrations and bad credentials, which is
 * exactly what it exists to catch.
 */
const healthHandler = async (c: Context) => {
  try {
    const rows = await raw.rows<{ n: number }>("select count(*)::int as n from users")
    const migrated = rows.length === 1
    if (!migrated) throw new Error("users table returned no rows")
    return c.json({ status: "ok", database: "connected", timestamp: new Date().toISOString() })
  } catch (err) {
    log.error(`health check failed: ${err instanceof Error ? err.message : String(err)}`)
    return c.json(
      {
        status: "degraded",
        database: "unavailable",
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      503,
    )
  }
}

app.get("/health", healthHandler)
app.get("/api/health", healthHandler)

app.route("/api/auth", auth)
app.route("/api/documents", documentsRoute)
app.route("/api/documents", documentAttachmentsRoute)
app.route("/api/attachments", attachments)
app.route("/api/reports", reports)
app.route("/api/export", exportRoutes)
app.route("/api/admin", adminUsers)
app.route("/api/admin", adminMeta)

app.notFound((c) => c.json({ error: "Not found" }, 404))

app.onError((err, c) => {
  if (err instanceof HTTPException) return err.getResponse()
  log.error(`${c.req.method} ${c.req.path} failed: ${err.message}`, err)
  Sentry.captureException(err)
  return c.json({ error: "Internal server error" }, 500)
})

app.get("/", (c) => c.json({ service: "dts-api", health: "/api/health" }))

/**
 * Vercel invokes this default export as a fetch handler. Locally, `bun src/index.ts`
 * automatically serves the same export on $PORT (default 3000) — there is no
 * explicit listener here, because adding one would double-bind the port.
 */
export default app
