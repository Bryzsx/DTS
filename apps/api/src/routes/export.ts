import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { db } from "../db/index.js"
import { documents } from "../db/schema.js"
import { authMiddleware } from "../middleware/auth.js"
import { buildFilters, listQuerySchema } from "./documents.js"
import { buildXlsx, type SheetCell } from "../lib/xlsx.js"
import { todayStr } from "../lib/today.js"

const exportRoutes = new Hono()
exportRoutes.use("*", authMiddleware)

/**
 * Excel only detects UTF-8 in a CSV when the file starts with a BOM. Written as an
 * escape on purpose: a literal U+FEFF in source is invisible and trips lint.
 */
const UTF8_BOM = "\uFEFF"

/** Columns mirrored from the official DTS template, in field order. */
const COLUMNS = [
  ["DTS Reference No.", "dtsReferenceNo"],
  ["Date & Time Received", "dateTimeReceived"],
  ["Mode of Receipt", "modeOfReceipt"],
  ["Document Type", "documentType"],
  ["Date of Document", "dateOfDocument"],
  ["Reference No.", "referenceNo"],
  ["Sender / Originating Office", "senderOriginatingOffice"],
  ["Subject / Brief Description", "subjectBriefDescription"],
  ["Attachments", "attachments"],
  ["Urgency Level", "urgencyLevel"],
  ["RD Disposition", "rdDisposition"],
  ["RD Decision Date", "rdDecisionDate"],
  ["Referred / Assigned To", "referredAssignedTo"],
  ["Action Required", "actionRequired"],
  ["Deadline / Due Date", "deadlineDueDate"],
  ["Status", "status"],
  ["Date Forwarded", "dateForwarded"],
  ["Date Action Completed", "dateActionCompleted"],
  ["Response / Outgoing Ref. No.", "responseOutgoingReferenceNo"],
  ["Proof of Transmission/Receipt", "proofOfTransmissionReceipt"],
  ["Remarks", "remarks"],
] as const

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return ""
  const s = value instanceof Date ? value.toISOString() : String(value)
  // Neutralise spreadsheet formula injection (a cell starting with = + - @).
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

exportRoutes.get("/documents.csv", zValidator("query", listQuerySchema), async (c) => {
  const q = c.req.valid("query")
  const rows = await db.select().from(documents).where(buildFilters(q)).limit(5000)

  const lines = [COLUMNS.map(([label]) => csvCell(label)).join(",")]
  for (const row of rows) {
    lines.push(COLUMNS.map(([, key]) => csvCell((row as Record<string, unknown>)[key])).join(","))
  }

  return new Response(`${UTF8_BOM}${lines.join("\r\n")}`, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="dts-records-${todayStr()}.csv"`,
      "Cache-Control": "private, no-store",
    },
  })
})

exportRoutes.get("/documents.xlsx", zValidator("query", listQuerySchema), async (c) => {
  const q = c.req.valid("query")
  const rows = await db.select().from(documents).where(buildFilters(q)).limit(5000)

  const body: SheetCell[][] = [COLUMNS.map(([label]) => label)]
  for (const row of rows) {
    body.push(
      COLUMNS.map(([, key]) => {
        const value = (row as Record<string, unknown>)[key]
        return value instanceof Date ? value.toISOString() : (value as SheetCell)
      }),
    )
  }

  return new Response(buildXlsx({ name: "DTS Records", rows: body }) as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="dts-records-${todayStr()}.xlsx"`,
      "Cache-Control": "private, no-store",
    },
  })
})

export { exportRoutes }
