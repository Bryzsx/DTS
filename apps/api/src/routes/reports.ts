import { Hono } from "hono"
import { and, asc, count, desc, eq, gt, gte, isNotNull, isNull, lte, sql } from "drizzle-orm"
import { db } from "../db/index.js"
import { STATUSES, URGENCY_LEVELS, documents, offices } from "../db/schema.js"
import { authMiddleware } from "../middleware/auth.js"

const reports = new Hono()
reports.use("*", authMiddleware)

const OPEN_STATUSES = ["Received", "Under Review", "For RD Action", "Referred", "Ongoing"] as const

/**
 * GET /api/reports/stats — the dashboard payload.
 *
 * Deliberately a handful of small aggregates rather than one clever query, so
 * the numbers on the dashboard can each be traced to a single source.
 */
reports.get("/stats", async (c) => {
  const today = new Date()

  const byStatus = await db
    .select({ status: documents.status, count: count() })
    .from(documents)
    .where(isNull(documents.archivedAt))
    .groupBy(documents.status)

  const byUrgency = await db
    .select({ urgencyLevel: documents.urgencyLevel, count: count() })
    .from(documents)
    .where(isNull(documents.archivedAt))
    .groupBy(documents.urgencyLevel)

  const overdue = await db
    .select({
      id: documents.id,
      dtsReferenceNo: documents.dtsReferenceNo,
      subjectBriefDescription: documents.subjectBriefDescription,
      deadlineDueDate: documents.deadlineDueDate,
      referredAssignedTo: documents.referredAssignedTo,
      status: documents.status,
    })
    .from(documents)
    .where(
      and(
        isNull(documents.archivedAt),
        isNotNull(documents.deadlineDueDate),
        lte(documents.deadlineDueDate, today.toISOString().slice(0, 10)),
        sql`${documents.status} NOT IN ('Completed','Closed')`,
      ),
    )
    .orderBy(asc(documents.deadlineDueDate))
    .limit(25)

  const upcoming = await db
    .select({
      id: documents.id,
      dtsReferenceNo: documents.dtsReferenceNo,
      subjectBriefDescription: documents.subjectBriefDescription,
      deadlineDueDate: documents.deadlineDueDate,
      referredAssignedTo: documents.referredAssignedTo,
      status: documents.status,
    })
    .from(documents)
    .where(
      and(
        isNull(documents.archivedAt),
        isNotNull(documents.deadlineDueDate),
        gt(documents.deadlineDueDate, today.toISOString().slice(0, 10)),
        lte(documents.deadlineDueDate, plusDays(today, 7)),
        sql`${documents.status} NOT IN ('Completed','Closed')`,
      ),
    )
    .orderBy(asc(documents.deadlineDueDate))
    .limit(25)

  const intakeByMonth = await db
    .select({
      month: sql<string>`to_char(date_trunc('month', ${documents.dateTimeReceived}), 'YYYY-MM')`,
      count: count(),
    })
    .from(documents)
    .where(gte(documents.dateTimeReceived, new Date(Date.now() - 365 * 86400000)))
    .groupBy(sql`date_trunc('month', ${documents.dateTimeReceived})`)
    .orderBy(sql`date_trunc('month', ${documents.dateTimeReceived})`)

  const byOffice = await db
    .select({ assignedTo: documents.referredAssignedTo, count: count() })
    .from(documents)
    .where(and(isNull(documents.archivedAt), isNotNull(documents.referredAssignedTo)))
    .groupBy(documents.referredAssignedTo)
    .orderBy(desc(count()))
    .limit(10)

  const officeDirectory = await db
    .select({ name: offices.name })
    .from(offices)
    .where(eq(offices.active, true))

  const [{ total }] = await db
    .select({ total: count() })
    .from(documents)
    .where(isNull(documents.archivedAt))

  const openCount = byStatus
    .filter((r) => (OPEN_STATUSES as readonly string[]).includes(r.status))
    .reduce((sum, r) => sum + Number(r.count), 0)

  const closedThisYear = await db
    .select({ count: count() })
    .from(documents)
    .where(
      and(
        sql`${documents.status} = 'Closed'`,
        gte(documents.updatedAt, new Date(Date.now() - 365 * 86400000)),
      ),
    )

  return c.json({
    total,
    open: openCount,
    overdue: overdue.length,
    dueThisWeek: upcoming.length,
    closedLast12Months: Number(closedThisYear[0]?.count ?? 0),
    byStatus: STATUSES.map((status) => ({
      status,
      count: Number(byStatus.find((r) => r.status === status)?.count ?? 0),
    })),
    byUrgency: URGENCY_LEVELS.map((urgencyLevel) => ({
      urgencyLevel,
      count: Number(byUrgency.find((r) => r.urgencyLevel === urgencyLevel)?.count ?? 0),
    })),
    intakeByMonth,
    byOffice: byOffice.map((r) => ({ office: r.assignedTo as string, count: Number(r.count) })),
    offices: officeDirectory.map((o) => o.name),
    overdueList: overdue,
    upcomingList: upcoming,
  })
})

function plusDays(from: Date, days: number): string {
  return new Date(from.getTime() + days * 86400000).toISOString().slice(0, 10)
}

/** GET /api/reports/register — the printable register, honouring a date range. */
reports.get("/register", async (c) => {
  const from = c.req.query("from")
  const to = c.req.query("to")

  const clauses = [isNull(documents.archivedAt)]
  if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) {
    clauses.push(gte(documents.dateTimeReceived, new Date(`${from}T00:00:00.000Z`)))
  }
  if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) {
    clauses.push(lte(documents.dateTimeReceived, new Date(`${to}T23:59:59.999Z`)))
  }

  const rows = await db
    .select()
    .from(documents)
    .where(and(...clauses))
    .orderBy(desc(documents.dateTimeReceived))
    .limit(2000)

  return c.json({ documents: rows, from: from ?? null, to: to ?? null })
})

export { reports }
