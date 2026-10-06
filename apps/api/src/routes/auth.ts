import { Hono } from "hono"
import { z } from "zod"
import { zValidator } from "@hono/zod-validator"
import { eq } from "drizzle-orm"
import { db } from "../db/index.js"
import { users } from "../db/schema.js"
import { authMiddleware, getUserId } from "../middleware/auth.js"
import { hashPassword, verifyPassword } from "../lib/password.js"
import { logAudit } from "../lib/audit.js"
import { clientIp, rateLimit } from "../lib/rate-limit.js"
import {
  REFRESH_COOKIE,
  consumeRefreshToken,
  issueRefreshToken,
  refreshCookieOptions,
  revokeAllRefreshTokens,
  signAccessToken,
} from "../lib/tokens.js"

const auth = new Hono()

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
})

const publicUser = (u: {
  id: number
  name: string
  email: string
  role: string
  status: string
  lastLoginAt: Date | null
}) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role,
  status: u.status,
  lastLoginAt: u.lastLoginAt,
})

/**
 * POST /api/auth/login
 *
 * Accounts are created by an administrator — there is no public sign-up.
 * Failures are deliberately indistinguishable (same message, same status) so
 * the endpoint cannot be used to discover which emails exist.
 */
auth.post(
  "/login",
  rateLimit({
    windowMs: 60_000,
    max: 10,
    keyOf: (c) => clientIp(c),
    message: "Too many sign-in attempts. Please wait a minute and try again.",
  }),
  zValidator("json", loginSchema),
  async (c) => {
    const { email, password } = c.req.valid("json")

    const found = await db.select().from(users).where(eq(users.email, email)).limit(1)
    const user = found[0]

    const invalid = c.json({ error: "Invalid email or password" }, 401)
    if (!user) {
      // Burn comparable time so a missing account is not detectable by timing.
      await verifyPassword(password, DUMMY_HASH)
      return invalid
    }
    if (!user.passwordHash) return invalid

    const ok = await verifyPassword(password, user.passwordHash)
    if (!ok) {
      logAudit(c, "auth.login_failed", { userId: user.id, entity: "user", entityId: user.id })
      return invalid
    }
    if (user.status !== "active") {
      return c.json({ error: "This account has been disabled" }, 403)
    }

    await db
      .update(users)
      .set({ lastLoginAt: new Date(), updatedAt: new Date() })
      .where(eq(users.id, user.id))

    const token = await signAccessToken(user)
    const refresh = await issueRefreshToken(user.id, c.req.header("user-agent"), clientIp(c))
    c.header(
      "Set-Cookie",
      `${REFRESH_COOKIE}=${refresh}; ${serializeCookie(refreshCookieOptions())}`,
    )
    logAudit(c, "auth.login", { userId: user.id, entity: "user", entityId: user.id })

    // The client stores `accessToken`; there is no separate `token` field.
    return c.json({ accessToken: token, user: publicUser({ ...user, lastLoginAt: new Date() }) })
  },
)

/** POST /api/auth/refresh — rotates the refresh cookie and mints a new access token. */
auth.post("/refresh", async (c) => {
  const raw = c.req.header("Cookie")?.match(new RegExp(`${REFRESH_COOKIE}=([^;]+)`))?.[1]
  if (!raw) return c.json({ error: "Unauthorized" }, 401)

  const consumed = await consumeRefreshToken(raw)
  if (!consumed) {
    c.header(
      "Set-Cookie",
      `${REFRESH_COOKIE}=; ${serializeCookie({ ...refreshCookieOptions(), maxAge: 0 })}`,
    )
    return c.json({ error: "Unauthorized" }, 401)
  }

  const found = await db.select().from(users).where(eq(users.id, consumed.userId)).limit(1)
  const user = found[0]
  if (!user || user.status !== "active") return c.json({ error: "Unauthorized" }, 401)

  const token = await signAccessToken(user)
  const refresh = await issueRefreshToken(user.id, c.req.header("user-agent"), clientIp(c))
  c.header("Set-Cookie", `${REFRESH_COOKIE}=${refresh}; ${serializeCookie(refreshCookieOptions())}`)
  return c.json({ accessToken: token, user: publicUser(user) })
})

/** GET /api/auth/me — the session probe used on app load. */
auth.get("/me", authMiddleware, async (c) => {
  // Re-read from the database rather than trusting the claims on the token, so
  // a name or role change takes effect on the next request.
  const found = await db
    .select()
    .from(users)
    .where(eq(users.id, getUserId(c)))
    .limit(1)
  if (!found[0]) return c.json({ error: "Unauthorized" }, 401)
  return c.json({ user: publicUser(found[0]) })
})

/** POST /api/auth/change-password — bumps tokenVersion so every session dies. */
auth.post(
  "/change-password",
  authMiddleware,
  zValidator(
    "json",
    z.object({
      currentPassword: z.string().min(1),
      newPassword: z
        .string()
        .min(10, "Use at least 10 characters")
        .regex(/[A-Za-z]/, "Include at least one letter")
        .regex(/[0-9]/, "Include at least one number"),
    }),
  ),
  async (c) => {
    const userId = getUserId(c)
    const { currentPassword, newPassword } = c.req.valid("json")

    const found = await db.select().from(users).where(eq(users.id, userId)).limit(1)
    const user = found[0]
    if (!user?.passwordHash) return c.json({ error: "Unauthorized" }, 401)

    const ok = await verifyPassword(currentPassword, user.passwordHash)
    if (!ok) return c.json({ error: "Current password is incorrect" }, 400)

    await db
      .update(users)
      .set({
        passwordHash: await hashPassword(newPassword),
        tokenVersion: user.tokenVersion + 1,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
    await revokeAllRefreshTokens(userId)
    c.header(
      "Set-Cookie",
      `${REFRESH_COOKIE}=; ${serializeCookie({ ...refreshCookieOptions(), maxAge: 0 })}`,
    )
    logAudit(c, "auth.password_changed", { userId, entity: "user", entityId: userId })

    return c.json({ ok: true })
  },
)

/** POST /api/auth/logout */
auth.post("/logout", async (c) => {
  const raw = c.req.header("Cookie")?.match(new RegExp(`${REFRESH_COOKIE}=([^;]+)`))?.[1]
  if (raw) await consumeRefreshToken(raw)
  c.header(
    "Set-Cookie",
    `${REFRESH_COOKIE}=; ${serializeCookie({ ...refreshCookieOptions(), maxAge: 0 })}`,
  )
  return c.json({ ok: true })
})

// Argon2id hash of a random value — used to equalise timing on unknown accounts.
const DUMMY_HASH =
  "$argon2id$v=19$m=19456,t=2,p=1$c2FsdHNhbHRzYWx0c2FsdA$QnFuZHVtbXlYb2xEQVJFQUxOR0RBU1RSQUxUVkFMVUU"

/** Serialises a refresh cookie, clearing it with maxAge 0 when present but invalid. */
function serializeCookie(opts: {
  httpOnly: boolean
  secure: boolean
  sameSite: string
  path: string
  maxAge: number
}) {
  return [
    `Path=${opts.path}`,
    `Max-Age=${opts.maxAge}`,
    `SameSite=${opts.sameSite}`,
    opts.httpOnly ? "HttpOnly" : "",
    opts.secure ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ")
}

export { auth }
