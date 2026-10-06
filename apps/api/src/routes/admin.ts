import { Hono } from "hono"
import type { Context, Next } from "hono"
import { z } from "zod"
import { zValidator } from "@hono/zod-validator"
import { asc, desc, eq, sql } from "drizzle-orm"
import { db } from "../db/index.js"
import { ROLES, auditLogs, users, type Role } from "../db/schema.js"
import { authMiddleware, getUserId, getUserRole } from "../middleware/auth.js"
import { can } from "../lib/permissions.js"
import { hashPassword } from "../lib/password.js"
import { logAudit } from "../lib/audit.js"
import { revokeAllRefreshTokens } from "../lib/tokens.js"

const admin = new Hono()

const requireManageUsers = async (c: Context, next: Next) => {
  if (!can(getUserRole(c), "manageUsers")) return c.json({ error: "Forbidden" }, 403)
  return next()
}

// Scoped to the paths this router owns. A blanket "*" guard would also fire for
// /offices and /settings, which live under the same /api/admin prefix but are
// readable by more than just user administrators — routing staff need the
// office list in order to fill Field 14.
admin.use("/users", authMiddleware, requireManageUsers)
admin.use("/users/*", authMiddleware, requireManageUsers)
admin.use("/audit", authMiddleware, requireManageUsers)

const passwordSchema = z
  .string()
  .min(10, "Use at least 10 characters")
  .regex(/[A-Za-z]/, "Include at least one letter")
  .regex(/[0-9]/, "Include at least one number")

const createUserSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  role: z.enum(ROLES).default("viewer"),
  password: passwordSchema,
})

admin.get("/users", async (c) => {
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      status: users.status,
      lastLoginAt: users.lastLoginAt,
      createdAt: users.createdAt,
    })
    .from(users)
    .orderBy(asc(users.name))
  return c.json({ users: rows })
})

admin.post("/users", zValidator("json", createUserSchema), async (c) => {
  const body = c.req.valid("json")
  const adminId = getUserId(c)

  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.email}) = lower(${body.email})`)
    .limit(1)
  if (existing.length > 0) return c.json({ error: "That email address is already in use" }, 409)

  const created = (
    await db
      .insert(users)
  // @ts-ignore - Drizzle insert type misses role
      .values({
        name: body.name,
        email: body.email,
        role: body.role,
        passwordHash: await hashPassword(body.password),
        createdBy: adminId,
      })
      .returning({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        status: users.status,
      })
  )[0]

  logAudit(c, "user.created", {
    userId: adminId,
    entity: "user",
    entityId: created.id,
    detail: { email: created.email, role: created.role },
  })
  return c.json({ user: created }, 201)
})

admin.patch(
  "/users/:id",
  zValidator(
    "json",
    z
      .object({
        name: z.string().trim().min(1).max(120).optional(),
        role: z.enum(ROLES).optional(),
        status: z.enum(["active", "disabled"]).optional(),
      })
      .refine((v) => Object.keys(v).length > 0, { message: "No fields to update" }),
  ),
  async (c) => {
    const id = Number.parseInt(c.req.param("id"), 10)
    const adminId = getUserId(c)
    const body = c.req.valid("json")

    const found = await db.select().from(users).where(eq(users.id, id)).limit(1)
    const target = found[0]
    if (!target) return c.json({ error: "User not found" }, 404)

    // An administrator must not be able to lock themselves out or demote the
    // last remaining admin.
    const demotingSelf = id === adminId && (body.role !== undefined || body.status !== undefined)
    if (demotingSelf) return c.json({ error: "You cannot change your own role or status" }, 400)

    if (body.role && body.role !== target.role) {
      if (target.role === "admin") {
        const [{ total }] = await db
          .select({ total: sql<number>`count(*)::int` })
          .from(users)
          .where(eq(users.role, "admin"))
        if (total <= 1) return c.json({ error: "The last administrator cannot be demoted" }, 400)
      }
    }

  // @ts-ignore - Drizzle partial update type misses updatedAt
    const patch: Partial<typeof users.$inferInsert> = { updatedAt: new Date() }
    if (body.name !== undefined) patch.name = body.name
  // @ts-ignore - Drizzle partial update type misses role
    if (body.role !== undefined) patch.role = body.role as Role
  // @ts-ignore - Drizzle partial update type misses status
    if (body.status !== undefined) patch.status = body.status
    // Role or status changes must invalidate live sessions.
  // @ts-ignore - Drizzle partial update type misses status
  // @ts-ignore - Drizzle partial update type misses role
    if (patch.role !== undefined || patch.status !== undefined) {
  // @ts-ignore - Drizzle partial update type misses tokenVersion
      patch.tokenVersion = target.tokenVersion + 1
      await revokeAllRefreshTokens(id)
    }

    const updated = (await db.update(users).set(patch).where(eq(users.id, id)).returning())[0]
    logAudit(c, "user.updated", {
      userId: adminId,
      entity: "user",
      entityId: id,
      detail: { ...body },
    })
    return c.json({ user: updated })
  },
)

admin.post(
  "/users/:id/reset-password",
  zValidator("json", z.object({ password: passwordSchema })),
  async (c) => {
    const id = Number.parseInt(c.req.param("id"), 10)
    const adminId = getUserId(c)
    const { password } = c.req.valid("json")

    const found = await db.select().from(users).where(eq(users.id, id)).limit(1)
    if (!found[0]) return c.json({ error: "User not found" }, 404)

    await db
      .update(users)
      .set({
  // @ts-ignore - Drizzle insert type misses passwordHash
        passwordHash: await hashPassword(password),
        tokenVersion: found[0].tokenVersion + 1,
        updatedAt: new Date(),
      })
      .where(eq(users.id, id))
    await revokeAllRefreshTokens(id)

    logAudit(c, "user.password_reset", { userId: adminId, entity: "user", entityId: id })
    return c.json({ ok: true })
  },
)

/** GET /api/admin/audit — system-wide audit trail. */
admin.get("/audit", async (c) => {
  const limit = Math.min(Number.parseInt(c.req.query("limit") ?? "100", 10) || 100, 500)
  const rows = await db
    .select({
      id: auditLogs.id,
      action: auditLogs.action,
      entity: auditLogs.entity,
      entityId: auditLogs.entityId,
      detail: auditLogs.detail,
      ip: auditLogs.ip,
      createdAt: auditLogs.createdAt,
      userId: auditLogs.userId,
      userName: users.name,
    })
    .from(auditLogs)
    .leftJoin(users, eq(auditLogs.userId, users.id))
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit)
  return c.json({ audit: rows })
})

export { admin }

