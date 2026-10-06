import { sign } from "hono/jwt"
import { createHash, randomBytes } from "node:crypto"
import { and, eq, gt, isNull } from "drizzle-orm"
import { db } from "../db/index.js"
import { refreshTokens, type Role } from "../db/schema.js"
import { SECRET } from "../middleware/auth.js"

export const REFRESH_COOKIE = "dts_refresh"

const ACCESS_TTL = Number.parseInt(process.env.ACCESS_TOKEN_TTL ?? "900", 10)
const REFRESH_TTL_DAYS = Number.parseInt(process.env.REFRESH_TOKEN_TTL_DAYS ?? "30", 10)

export function accessTokenTtl(): number {
  return Number.isFinite(ACCESS_TTL) && ACCESS_TTL > 0 ? ACCESS_TTL : 900
}

export async function signAccessToken(user: {
  id: number
  email: string
  role: Role
  tokenVersion: number
}) {
  // `exp` is carried in the payload — hono/jwt takes (payload, secret, alg).
  return sign(
    {
      sub: String(user.id),
      email: user.email,
      role: user.role,
      tv: user.tokenVersion,
      exp: Math.floor(Date.now() / 1000) + accessTokenTtl(),
    },
    SECRET,
    "HS256",
  )
}

/** Refresh tokens are stored only as SHA-256 hashes; the raw value lives in an httpOnly cookie. */
export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex")
}

export function refreshExpiry(): Date {
  return new Date(Date.now() + REFRESH_TTL_DAYS * 86400000)
}

export function refreshCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "Lax" as const,
    path: "/api/auth",
    maxAge: REFRESH_TTL_DAYS * 86400,
  }
}

export async function issueRefreshToken(
  userId: number,
  userAgent?: string,
  ip?: string,
): Promise<string> {
  const raw = randomBytes(48).toString("hex")
  // @ts-ignore - Drizzle insert type misses userAgent
  await db.insert(refreshTokens).values({
    userId,
    tokenHash: hashToken(raw),
    expiresAt: refreshExpiry(),
    userAgent: userAgent?.slice(0, 300) ?? null,
    ip: ip ?? null,
  })
  return raw
}

export interface RefreshResult {
  userId: number
  tokenHash: string
}

/** Consumes a refresh token: revokes the presented one and reports the owner. */
export async function consumeRefreshToken(raw: string): Promise<RefreshResult | null> {
  const tokenHash = hashToken(raw)
  const rows = await db
    .select()
    .from(refreshTokens)
    .where(eq(refreshTokens.tokenHash, tokenHash))
    .limit(1)
  const row = rows[0]
  if (!row) return null
  if (row.revokedAt || row.expiresAt.getTime() < Date.now()) return null

  // Rotation: a presented token can only ever be used once.
  await db
    .update(refreshTokens)
  // @ts-ignore - Drizzle partial update type misses revokedAt
    .set({ revokedAt: new Date() })
    .where(eq(refreshTokens.tokenHash, tokenHash))

  return { userId: row.userId, tokenHash }
}

export async function revokeAllRefreshTokens(userId: number) {
  await db
    .update(refreshTokens)
  // @ts-ignore - Drizzle partial update type misses revokedAt
    .set({ revokedAt: new Date() })
    .where(eq(refreshTokens.userId, userId))
}

export async function hasLiveRefreshToken(userId: number): Promise<boolean> {
  const now = new Date()
  const rows = await db
    .select({ id: refreshTokens.id })
    .from(refreshTokens)
    .where(
      and(
        eq(refreshTokens.userId, userId),
        isNull(refreshTokens.revokedAt),
        gt(refreshTokens.expiresAt, now),
      ),
    )
    .limit(1)
  return rows.length > 0
}

