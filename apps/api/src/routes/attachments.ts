import { Hono } from "hono"
import { asc, eq } from "drizzle-orm"
import { db } from "../db/index.js"
import { documentAttachments, documents } from "../db/schema.js"
import { authMiddleware, getUserId, getUserRole } from "../middleware/auth.js"
import { can } from "../lib/permissions.js"
import { logAudit } from "../lib/audit.js"
import { AttachmentError, saveDocumentAttachment } from "../lib/attachment.js"
import { deleteAttachment, readAttachment, saveAttachment } from "../lib/storage.js"

/**
 * Attachment routes live under two prefixes:
 *   /api/documents/:documentId/attachments  — list and upload for a record
 *   /api/attachments/:id                   — download and delete one file
 * They are kept in one module but exposed as two routers so each mounts at the
 * prefix its URL actually uses.
 */
const documentAttachmentsRoute = new Hono()
const attachments = new Hono()
documentAttachmentsRoute.use("*", authMiddleware)
attachments.use("*", authMiddleware)

/** GET /api/documents/:documentId/attachments — mounted at /api/documents */
documentAttachmentsRoute.get("/:documentId/attachments", async (c) => {
  const documentId = Number.parseInt(c.req.param("documentId"), 10)
  const rows = await db
    .select({
      id: documentAttachments.id,
      filename: documentAttachments.filename,
      contentType: documentAttachments.contentType,
      sizeBytes: documentAttachments.sizeBytes,
      createdAt: documentAttachments.createdAt,
    })
    .from(documentAttachments)
    .where(eq(documentAttachments.documentId, documentId))
    .orderBy(asc(documentAttachments.createdAt))

  return c.json({ attachments: rows })
})

/** POST /api/documents/:documentId/attachments — multipart/form-data with a `file` field. */
documentAttachmentsRoute.post("/:documentId/attachments", async (c) => {
  const role = getUserRole(c)
  if (!can(role, "uploadAttachment")) return c.json({ error: "Forbidden" }, 403)

  const documentId = Number.parseInt(c.req.param("documentId"), 10)
  const found = await db
    .select({ id: documents.id, ref: documents.dtsReferenceNo })
    .from(documents)
    .where(eq(documents.id, documentId))
    .limit(1)
  if (!found[0]) return c.json({ error: "Document not found" }, 404)

  const userId = getUserId(c)
  let file: File | undefined
  try {
    const body = await c.req.parseBody()
    file = body.file as File | undefined
    const stored = await saveDocumentAttachment(file!, `documents/${documentId}`)
    await saveAttachment({
      buffer: stored.buffer,
      storageKey: stored.storageKey,
      contentType: stored.contentType,
    })
    const inserted = (
      await db
        .insert(documentAttachments)
  // @ts-ignore - Drizzle insert type misses uploadedBy
        .values({
          documentId,
          filename: stored.filename,
          storageKey: stored.storageKey,
          contentType: stored.contentType,
          sizeBytes: stored.sizeBytes,
          uploadedBy: userId,
        })
        .returning()
    )[0]
    logAudit(c, "attachment.uploaded", {
      userId,
      entity: "document",
      entityId: documentId,
      detail: { filename: stored.filename, sizeBytes: stored.sizeBytes },
    })
    // `storageKey` is an internal blob pathname and is never sent to a client —
    // bytes are only reachable through GET /api/attachments/:id/file.
    const { storageKey: _private, ...publicRow } = inserted
    return c.json({ attachment: publicRow }, 201)
  } catch (err) {
    if (err instanceof AttachmentError) return c.json({ error: err.message }, 400)
    throw err
  }
})

/**
 * GET /api/attachments/:id/file
 *
 * The only way attachment bytes leave the server. Every attachment URL is
 * authenticated, so a shared link grants access to nobody.
 */
attachments.get("/:id/file", async (c) => {
  const id = Number.parseInt(c.req.param("id"), 10)
  const rows = await db
    .select()
    .from(documentAttachments)
    .where(eq(documentAttachments.id, id))
    .limit(1)
  const row = rows[0]
  if (!row) return c.json({ error: "Attachment not found" }, 404)

  const stored = await readAttachment(row.storageKey)
  if (!stored) return c.json({ error: "Attachment not found" }, 404)

  const disposition = c.req.query("disposition") === "inline" ? "inline" : "attachment"
  const safeName = row.filename.replace(/["\\\r\n]/g, "_")
  return c.newResponse(stored.data as ArrayBuffer, 200, {
    "Content-Type": row.contentType,
    "Content-Length": String(row.sizeBytes),
    "Content-Disposition": `${disposition}; filename="${safeName}"`,
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "private, no-store",
  })
})

/** DELETE /api/attachments/:id */
attachments.delete("/:id", async (c) => {
  const role = getUserRole(c)
  if (!can(role, "deleteAttachment")) return c.json({ error: "Forbidden" }, 403)

  const id = Number.parseInt(c.req.param("id"), 10)
  const rows = await db
    .select()
    .from(documentAttachments)
    .where(eq(documentAttachments.id, id))
    .limit(1)
  const row = rows[0]
  if (!row) return c.json({ error: "Attachment not found" }, 404)

  await db.delete(documentAttachments).where(eq(documentAttachments.id, id))
  await deleteAttachment(row.storageKey)

  const userId = getUserId(c)
  logAudit(c, "attachment.deleted", {
    userId,
    entity: "document",
    entityId: row.documentId,
    detail: { filename: row.filename },
  })
  return c.json({ ok: true })
})

/** GET /api/documents/:documentId/attachments/count — cheap badge counter. */
documentAttachmentsRoute.get("/:documentId/attachments/count", async (c) => {
  const documentId = Number.parseInt(c.req.param("documentId"), 10)
  const rows = await db
    .select({ id: documentAttachments.id })
    .from(documentAttachments)
    .where(eq(documentAttachments.documentId, documentId))
  return c.json({ count: rows.length })
})

export { attachments, documentAttachmentsRoute }

