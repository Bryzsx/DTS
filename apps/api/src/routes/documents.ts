import { Hono } from "hono"
import { z } from "zod"
import { zValidator } from "@hono/zod-validator"
import { and, asc, desc, eq, gte, ilike, isNotNull, isNull, lte, or, sql } from "drizzle-orm"
import { db, raw } from "../db/index.js"
import {
  DOCUMENT_TYPES,
  MODES_OF_RECEIPT,
  RD_DISPOSITIONS,
  STATUSES,
  URGENCY_LEVELS,
  auditLogs,
  documents,
  users,
  type DocumentStatus,
} from "../db/schema.js"
import { authMiddleware, getUserId, getUserRole } from "../middleware/auth.js"
import { can, checkTransition, EDITABLE_FIELDS, FIELD_PERMISSION } from "../lib/permissions.js"
import { logAudit } from "../lib/audit.js"

const documentsRoute = new Hono()
documentsRoute.use("*", authMiddleware)

const documentInput = z.object({
  dtsReferenceNo: z.string().trim().max(60).optional(),
  dateTimeReceived: z.coerce.date().optional(),
  modeOfReceipt: z.enum(MODES_OF_RECEIPT),
  documentType: z.enum(DOCUMENT_TYPES),
  dateOfDocument: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
    .nullish(),
  referenceNo: z.string().trim().max(120).nullish(),
  senderOriginatingOffice: z
    .string()
    .trim()
    .min(1, "Sender / originating office is required")
    .max(200),
  subjectBriefDescription: z
    .string()
    .trim()
    .min(1, "Subject / brief description is required")
    .max(500),
  attachments: z.string().trim().max(1000).nullish(),
  urgencyLevel: z.enum(URGENCY_LEVELS).default("Routine"),
  rdDisposition: z.enum(RD_DISPOSITIONS).nullish(),
  rdDecisionDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
    .nullish(),
  referredAssignedTo: z.string().trim().max(200).nullish(),
  actionRequired: z.string().trim().max(2000).nullish(),
  deadlineDueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
    .nullish(),
  status: z.enum(STATUSES).default("Received"),
  dateForwarded: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
    .nullish(),
  dateActionCompleted: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
    .nullish(),
  responseOutgoingReferenceNo: z.string().trim().max(120).nullish(),
  proofOfTransmissionReceipt: z.string().trim().max(500).nullish(),
  remarks: z.string().trim().max(2000).nullish(),
})

/** Column values a client is never allowed to set directly. */
const SERVER_OWNED = new Set([
  "id",
  "createdBy",
  "createdAt",
  "updatedBy",
  "updatedAt",
  "archivedAt",
  "dtsReferenceNo",
])

const nullable = <T extends z.ZodTypeAny>(schema: T) =>
  schema.nullable().optional() as unknown as z.ZodType<T["_output"] | null | undefined>

const patchSchema = z
  .object({
    dateTimeReceived: z.coerce.date().nullable().optional(),
    modeOfReceipt: z.enum(MODES_OF_RECEIPT).nullable().optional(),
    documentType: z.enum(DOCUMENT_TYPES).nullable().optional(),
    dateOfDocument: nullable(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
    referenceNo: nullable(z.string().max(120)),
    senderOriginatingOffice: nullable(z.string().min(1).max(200)),
    subjectBriefDescription: nullable(z.string().min(1).max(500)),
    attachments: nullable(z.string().max(1000)),
    urgencyLevel: z.enum(URGENCY_LEVELS).nullable().optional(),
    rdDisposition: z.enum(RD_DISPOSITIONS).nullable().optional(),
    rdDecisionDate: nullable(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
    referredAssignedTo: nullable(z.string().max(200)),
    actionRequired: nullable(z.string().max(2000)),
    deadlineDueDate: nullable(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
    status: z.enum(STATUSES).nullable().optional(),
    dateForwarded: nullable(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
    dateActionCompleted: nullable(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
    responseOutgoingReferenceNo: nullable(z.string().max(120)),
    proofOfTransmissionReceipt: nullable(z.string().max(500)),
    remarks: nullable(z.string().max(2000)),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "No fields to update" })

const listQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  status: z.enum(STATUSES).optional(),
  urgencyLevel: z.enum(URGENCY_LEVELS).optional(),
  documentType: z.enum(DOCUMENT_TYPES).optional(),
  modeOfReceipt: z.enum(MODES_OF_RECEIPT).optional(),
  assignedTo: z.string().trim().max(200).optional(),
  dateFrom: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  dateTo: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  overdue: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
  includeArchived: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
  sort: z
    .enum([
      "received_desc",
      "received_asc",
      "deadline_asc",
      "reference_asc",
      "status_asc",
      "urgency_asc",
    ])
    .default("received_desc"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(25),
})

const SORT_COLUMNS = {
  received_desc: desc(documents.dateTimeReceived),
  received_asc: asc(documents.dateTimeReceived),
  deadline_asc: asc(documents.deadlineDueDate),
  reference_asc: asc(documents.dtsReferenceNo),
  status_asc: asc(documents.status),
  urgency_asc: asc(documents.urgencyLevel),
} as const

function buildFilters(q: z.infer<typeof listQuerySchema>) {
  const clauses = []

  if (!q.includeArchived) clauses.push(isNull(documents.archivedAt))
  if (q.status) clauses.push(eq(documents.status, q.status))
  if (q.urgencyLevel) clauses.push(eq(documents.urgencyLevel, q.urgencyLevel))
  if (q.documentType) clauses.push(eq(documents.documentType, q.documentType))
  if (q.modeOfReceipt) clauses.push(eq(documents.modeOfReceipt, q.modeOfReceipt))
  if (q.assignedTo) clauses.push(ilike(documents.referredAssignedTo, `%${q.assignedTo}%`))
  if (q.dateFrom)
    clauses.push(gte(documents.dateTimeReceived, new Date(`${q.dateFrom}T00:00:00.000Z`)))
  if (q.dateTo) clauses.push(lte(documents.dateTimeReceived, new Date(`${q.dateTo}T23:59:59.999Z`)))
  if (q.overdue) {
    // Open work past its deadline: has one, and not yet completed or closed.
    clauses.push(
      isNotNull(documents.deadlineDueDate),
      sql`${documents.deadlineDueDate} < CURRENT_DATE`,
      sql`${documents.status} NOT IN ('Completed','Closed')`,
    )
  }
  if (q.q) {
    const needle = `%${q.q}%`
    clauses.push(
      or(
        ilike(documents.dtsReferenceNo, needle),
        ilike(documents.referenceNo, needle),
        ilike(documents.subjectBriefDescription, needle),
        ilike(documents.senderOriginatingOffice, needle),
        ilike(documents.referredAssignedTo, needle),
      )!,
    )
  }

  return clauses.length ? and(...clauses) : undefined
}

/**
 * Mints the next control number for the current year: DTS-2026-0001.
 *
 * The counter lives in `sequences` and is bumped with a single atomic
 * upsert, so two officers encoding at the same instant can never collide on
 * the same number.
 */
export async function nextDtsReferenceNo(date = new Date()): Promise<string> {
  const year = date.getUTCFullYear()
  const rows = await raw.rows<{ last_value: number }>(
    `INSERT INTO sequences (name, year, last_value)
     VALUES ('dts', $1, 1)
     ON CONFLICT (name) DO UPDATE SET
       last_value = CASE WHEN sequences.year <> EXCLUDED.year THEN 1 ELSE sequences.last_value + 1 END,
       year = EXCLUDED.year,
       updated_at = now()
     RETURNING last_value`,
    [year],
  )
  const n = rows[0]?.last_value ?? 1
  return `DTS-${year}-${String(n).padStart(4, "0")}`
}

/** GET /api/documents — filtered, sorted, paginated register listing. */
documentsRoute.get("/", zValidator("query", listQuerySchema), async (c) => {
  const q = c.req.valid("query")
  const where = buildFilters(q)

  const rows = await db
    .select()
    .from(documents)
    .where(where)
    .orderBy(SORT_COLUMNS[q.sort])
    .limit(q.limit)
    .offset((q.page - 1) * q.limit)

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(documents)
    .where(where)

  return c.json({
    documents: rows,
    total,
    page: q.page,
    pageCount: Math.max(1, Math.ceil(total / q.limit)),
  })
})

/** POST /api/documents — intake. */
documentsRoute.post("/", zValidator("json", documentInput), async (c) => {
  const role = getUserRole(c)
  if (!can(role, "createDocument")) return c.json({ error: "Forbidden" }, 403)

  const body = c.req.valid("json")
  const userId = getUserId(c)

  const dtsReferenceNo =
    body.dtsReferenceNo && body.dtsReferenceNo.length > 0
      ? body.dtsReferenceNo
      : await nextDtsReferenceNo(body.dateTimeReceived ?? new Date())

  const inserted = await db
    .insert(documents)
  // @ts-ignore - Drizzle insert type misses createdBy
    .values({
      ...normalizeForDb(body),
      dtsReferenceNo,
      modeOfReceipt: body.modeOfReceipt,
      documentType: body.documentType,
      senderOriginatingOffice: body.senderOriginatingOffice,
      subjectBriefDescription: body.subjectBriefDescription,
      dateTimeReceived: body.dateTimeReceived ?? new Date(),
      createdBy: userId,
      updatedBy: userId,
    })
    .returning()

  const created = inserted[0]
  logAudit(c, "document.created", {
    userId,
    entity: "document",
    entityId: created.id,
    detail: { dtsReferenceNo: created.dtsReferenceNo },
  })
  return c.json({ document: created }, 201)
})

/** GET /api/documents/:id */
documentsRoute.get("/:id", async (c) => {
  const id = Number.parseInt(c.req.param("id"), 10)
  const found = await db.select().from(documents).where(eq(documents.id, id)).limit(1)
  if (!found[0]) return c.json({ error: "Document not found" }, 404)
  return c.json({ document: found[0] })
})

/**
 * PATCH /api/documents/:id
 *
 * Field-level authorisation: every column maps to a permission, so an officer
 * can encode and route a record but cannot set the RD's disposition. Status
 * changes additionally go through the workflow check.
 */
documentsRoute.patch("/:id", zValidator("json", patchSchema), async (c) => {
  const id = Number.parseInt(c.req.param("id"), 10)
  const role = getUserRole(c)
  const userId = getUserId(c)
  const body = c.req.valid("json")

  const serverOwnedKeys = Object.keys(body).filter((k) => SERVER_OWNED.has(k))
  if (serverOwnedKeys.length > 0) {
    return c.json(
      { error: `These fields cannot be edited directly: ${serverOwnedKeys.join(", ")}` },
      400,
    )
  }

  const denied = Object.keys(body).filter((key) => {
    const permission = FIELD_PERMISSION[key as keyof typeof FIELD_PERMISSION]
    return !permission || !can(role, permission)
  })
  if (denied.length > 0) {
    return c.json(
      {
        error: `Your role cannot change: ${denied.join(", ")}`,
        code: "FORBIDDEN_FIELDS",
        fields: denied,
      },
      403,
    )
  }

  const found = await db.select().from(documents).where(eq(documents.id, id)).limit(1)
  const existing = found[0]
  if (!existing) return c.json({ error: "Document not found" }, 404)
  if (existing.archivedAt) return c.json({ error: "This record is archived" }, 409)

  if (body.status && body.status !== existing.status) {
    const check = checkTransition(existing.status, body.status, role)
    if (!check.allowed) return c.json({ error: check.reason, code: "INVALID_TRANSITION" }, 400)
  }

  const patch = normalizeForDb(body) as Partial<typeof documents.$inferInsert>
  // @ts-ignore - Drizzle partial update type misses updatedBy
  patch.updatedBy = userId
  // @ts-ignore - Drizzle partial update type misses updatedAt
  patch.updatedAt = new Date()

  const updated = (await db.update(documents).set(patch).where(eq(documents.id, id)).returning())[0]

  const changes = diffFields(existing, body)
  for (const change of changes) {
    logAudit(c, "document.updated", {
      userId,
      entity: "document",
      entityId: id,
      detail: change,
    })
  }

  return c.json({ document: updated, changes })
})

/** DELETE /api/documents/:id — archive (admin only); records are never destroyed. */
documentsRoute.delete("/:id", async (c) => {
  const role = getUserRole(c)
  if (!can(role, "archiveDocument")) return c.json({ error: "Forbidden" }, 403)

  const id = Number.parseInt(c.req.param("id"), 10)
  const userId = getUserId(c)
  const result = await db
    .update(documents)
  // @ts-ignore - Drizzle partial update type misses archivedAt
    .set({ archivedAt: new Date(), updatedBy: userId, updatedAt: new Date() })
    .where(eq(documents.id, id))
    .returning({ id: documents.id })

  if (result.length === 0) return c.json({ error: "Document not found" }, 404)
  logAudit(c, "document.archived", { userId, entity: "document", entityId: id })
  return c.json({ ok: true })
})

/** GET /api/documents/:id/audit — reconstructable field history for one record. */
documentsRoute.get("/:id/audit", async (c) => {
  const id = Number.parseInt(c.req.param("id"), 10)
  const found = await db
    .select({ id: documents.id })
    .from(documents)
    .where(eq(documents.id, id))
    .limit(1)
  if (!found[0]) return c.json({ error: "Document not found" }, 404)

  const history = await db
    .select({
      id: auditLogs.id,
      action: auditLogs.action,
      detail: auditLogs.detail,
      createdAt: auditLogs.createdAt,
      userId: auditLogs.userId,
      userName: users.name,
    })
    .from(auditLogs)
    .leftJoin(users, eq(auditLogs.userId, users.id))
    .where(and(eq(auditLogs.entity, "document"), eq(auditLogs.entityId, String(id))))
    .orderBy(desc(auditLogs.createdAt))

  return c.json({ history })
})

/** Turns the zod output (undefined / null) into insert/update values. */
function normalizeForDb(input: Record<string, unknown>) {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue
    out[key] = value === null || value === "" ? null : value
  }
  return out
}

function diffFields(before: Record<string, unknown>, after: Record<string, unknown>) {
  const changes: Array<{ field: string; from: unknown; to: unknown }> = []
  for (const key of Object.keys(after)) {
    if (!EDITABLE_FIELDS.includes(key as (typeof EDITABLE_FIELDS)[number])) continue
    const next = normalizeForDb({ [key]: after[key] })[key]
    const prev = before[key] ?? null
    const normPrev = prev instanceof Date ? prev.toISOString() : prev
    if (String(normPrev ?? "") !== String(next ?? "")) {
      changes.push({ field: key, from: normPrev, to: next })
    }
  }
  return changes
}

export { documentsRoute, checkTransition, buildFilters, listQuerySchema }
export type { DocumentStatus }

