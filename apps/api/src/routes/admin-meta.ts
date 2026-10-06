import { Hono } from "hono"
import { z } from "zod"
import { zValidator } from "@hono/zod-validator"
import { asc, eq, sql } from "drizzle-orm"
import { db } from "../db/index.js"
import { offices, settings } from "../db/schema.js"
import { authMiddleware, getUserId, getUserRole } from "../middleware/auth.js"
import { can } from "../lib/permissions.js"
import { logAudit } from "../lib/audit.js"

const admin = new Hono()
admin.use("*", authMiddleware)

// ── Offices / divisions ─────────────────────────────────────────────────────
// A managed vocabulary for Field 14. The field itself stays free text so an
// unusual office name can always be typed; the list just keeps the common ones
// one click away and makes per-office reporting possible.

const officeSchema = z.object({
  name: z.string().trim().min(1, "Office name is required").max(120),
  code: z.string().trim().max(20).nullish(),
})

admin.get("/offices", async (c) => {
  const includeInactive = c.req.query("includeInactive") === "true"
  const rows = await db
    .select()
    .from(offices)
    .where(includeInactive ? undefined : eq(offices.active, true))
    .orderBy(asc(offices.sortOrder), asc(offices.name))
  return c.json({ offices: rows })
})

admin.post("/offices", zValidator("json", officeSchema), async (c) => {
  if (!can(getUserRole(c), "manageOffices")) return c.json({ error: "Forbidden" }, 403)
  const body = c.req.valid("json")

  const existing = await db
    .select({ id: offices.id })
    .from(offices)
    .where(sql`lower(${offices.name}) = lower(${body.name})`)
    .limit(1)
  if (existing.length > 0) return c.json({ error: "That office already exists" }, 409)

  const created = (
    await db
      .insert(offices)
      .values({ name: body.name, code: body.code ?? null })
      .returning()
  )[0]
  logAudit(c, "office.created", { userId: getUserId(c), entity: "office", entityId: created.id })
  return c.json({ office: created }, 201)
})

admin.patch(
  "/offices/:id",
  zValidator(
    "json",
    z.object({
      name: z.string().trim().min(1).max(120).optional(),
      active: z.boolean().optional(),
    }),
  ),
  async (c) => {
    if (!can(getUserRole(c), "manageOffices")) return c.json({ error: "Forbidden" }, 403)
    const id = Number.parseInt(c.req.param("id"), 10)
    const body = c.req.valid("json")

    const patch: Partial<typeof offices.$inferInsert> = {}
    if (body.name !== undefined) patch.name = body.name
    if (body.active !== undefined) patch.active = body.active

    const updated = (await db.update(offices).set(patch).where(eq(offices.id, id)).returning())[0]
    if (!updated) return c.json({ error: "Office not found" }, 404)
    logAudit(c, "office.updated", {
      userId: getUserId(c),
      entity: "office",
      entityId: id,
      detail: body,
    })
    return c.json({ office: updated })
  },
)

admin.delete("/offices/:id", async (c) => {
  if (!can(getUserRole(c), "manageOffices")) return c.json({ error: "Forbidden" }, 403)
  const id = Number.parseInt(c.req.param("id"), 10)
  const deleted = (
    await db.delete(offices).where(eq(offices.id, id)).returning({ id: offices.id })
  )[0]
  if (!deleted) return c.json({ error: "Office not found" }, 404)
  logAudit(c, "office.deleted", { userId: getUserId(c), entity: "office", entityId: id })
  return c.json({ ok: true })
})

// ── Settings (agency name / seal / subtitle) ────────────────────────────────

const SETTING_KEYS = [
  "agency_name",
  "agency_subtitle",
  "agency_seal_url",
  "register_title",
] as const

export const DEFAULT_SETTINGS: Record<(typeof SETTING_KEYS)[number], string> = {
  agency_name: "Document Tracking System",
  agency_subtitle: "Records Management Office",
  agency_seal_url: "",
  register_title: "Document Tracking Register",
}

admin.get("/settings", async (c) => {
  const rows = await db.select().from(settings)
  const merged = { ...DEFAULT_SETTINGS }
  for (const row of rows) {
    if ((SETTING_KEYS as readonly string[]).includes(row.key))
      merged[row.key as (typeof SETTING_KEYS)[number]] = row.value ?? ""
  }
  return c.json({ settings: merged })
})

admin.put(
  "/settings",
  zValidator(
    "json",
    z.object(Object.fromEntries(SETTING_KEYS.map((k) => [k, z.string().max(300).nullish()]))),
  ),
  async (c) => {
    if (!can(getUserRole(c), "manageSettings")) return c.json({ error: "Forbidden" }, 403)
    const body = c.req.valid("json")
    const userId = getUserId(c)

    for (const key of SETTING_KEYS) {
      const value = body[key] ?? null
      await db
        .insert(settings)
        .values({ key, value, updatedBy: userId })
        .onConflictDoUpdate({
          target: settings.key,
          set: { value, updatedAt: new Date(), updatedBy: userId },
        })
    }

    logAudit(c, "settings.updated", { userId, entity: "settings", detail: body })
    const rows = await db.select().from(settings)
    const merged = { ...DEFAULT_SETTINGS }
    for (const row of rows) {
      if ((SETTING_KEYS as readonly string[]).includes(row.key))
        merged[row.key as (typeof SETTING_KEYS)[number]] = row.value ?? ""
    }
    return c.json({ settings: merged })
  },
)

export { admin }
