import { verify } from "hono/jwt"
import type { Context, Next } from "hono"
import { and, eq } from "drizzle-orm"
import { db } from "../db/index.js"
import { users, type Role } from "../db/schema.js"

function resolveSecret(): string {
  const secret = process.env.JWT_SECRET
  if (secret) {
    if (secret.length < 16) throw new Error("JWT_SECRET must be at least 16 characters")
    return secret
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("JWT_SECRET is required in production")
  }
  return "dts-dev-secret-change-in-production"
}

const SECRET = resolveSecret()

export interface AuthPayload {
  sub: string
  email: string
  role: Role
  tv?: number
}

export interface AuthUser {
  id: number
  name: string
  email: string
  role: Role
  status: string
  tokenVersion: number
}

/**
 * Verifies the Bearer access token, enforces tokenVersion (so a password
 * change or role change kills every existing session) and rejects disabled
 * accounts.
 */
export const authMiddleware = async (c: Context, next: Next) => {
  const header = c.req.header("Authorization")
  if (!header?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401)
  }

  let payload: AuthPayload
  try {
    payload = (await verify(header.slice(7), SECRET, "HS256")) as unknown as AuthPayload
  } catch {
    return c.json({ error: "Unauthorized" }, 401)
  }

  const user = (
    await db
      .select()
      .from(users)
      .where(eq(users.id, Number.parseInt(payload.sub, 10)))
  )[0]
  if (!user) return c.json({ error: "Unauthorized" }, 401)
  if (user.status !== "active") return c.json({ error: "Account disabled" }, 403)
  if ((payload.tv ?? 0) !== user.tokenVersion) {
    return c.json({ error: "Session expired, please sign in again" }, 401)
  }

  c.set("jwtPayload", payload)
  c.set("user", user satisfies AuthUser)
  return next()
}

export function getUserId(c: Context): number {
  const user = c.get("user") as AuthUser | undefined
  if (user?.id) return user.id
  const payload = c.get("jwtPayload") as { sub: string }
  return Number.parseInt(payload.sub, 10)
}

export function getUserRole(c: Context): Role {
  const user = c.get("user") as AuthUser | undefined
  if (user?.role) return user.role
  return (c.get("jwtPayload") as { role: Role }).role
}

/** Must be used AFTER authMiddleware. */
export function requireRole(...roles: Role[]) {
  return async (c: Context, next: Next) => {
    const role = getUserRole(c)
    if (!roles.includes(role)) return c.json({ error: "Forbidden" }, 403)
    return next()
  }
}

/**
 * Locks an account row FOR UPDATE so that a concurrent role or password change
 * cannot race the session check above (used on login and token refresh).
 */
export async function lockUserById(id: number) {
  return db.select().from(users).where(eq(users.id, id)).for("update")
}

export async function findActiveUserByEmail(email: string) {
  return db
    .select()
    .from(users)
    .where(and(eq(users.email, email), eq(users.status, "active")))
    .limit(1)
}

export { SECRET }
