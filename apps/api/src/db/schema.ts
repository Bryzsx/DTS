import {
  pgTable,
  text,
  integer,
  boolean,
  jsonb,
  timestamp,
  date,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

/**
 * DTS schema.
 *
 * Two deliberate departures from a typical prototype schema:
 *  - real `timestamp` / `date` column types instead of TEXT dates, so that
 *    sorting, range filters and date math are index-friendly and correct;
 *  - every controlled vocabulary is enforced twice: a Postgres CHECK
 *    constraint here *and* a zod enum at the API edge.
 */

export const ROLES = ["admin", "officer", "rd", "viewer"] as const
export type Role = (typeof ROLES)[number]

export const MODES_OF_RECEIPT = ["Email", "Courier", "Hand-carried", "Other"] as const
export const DOCUMENT_TYPES = [
  "Letter",
  "Memorandum",
  "Request",
  "Invitation",
  "Endorsement",
  "Report",
  "Other",
] as const
export const URGENCY_LEVELS = ["Urgent", "High Priority", "Routine"] as const
export const RD_DISPOSITIONS = [
  "For approval",
  "For information",
  "For appropriate action",
  "Refer to concerned office",
  "Other",
] as const
export const STATUSES = [
  "Received",
  "Under Review",
  "For RD Action",
  "Referred",
  "Ongoing",
  "Completed",
  "Closed",
] as const

export type ModeOfReceipt = (typeof MODES_OF_RECEIPT)[number]
export type DocumentType = (typeof DOCUMENT_TYPES)[number]
export type UrgencyLevel = (typeof URGENCY_LEVELS)[number]
export type RdDisposition = (typeof RD_DISPOSITIONS)[number]
export type DocumentStatus = (typeof STATUSES)[number]

const roleCheck = sql`role in ('admin','officer','rd','viewer')`
const modeCheck = sql`mode_of_receipt in ('Email','Courier','Hand-carried','Other')`
const docTypeCheck = sql`document_type in ('Letter','Memorandum','Request','Invitation','Endorsement','Report','Other')`
const urgencyCheck = sql`urgency_level in ('Urgent','High Priority','Routine')`
const dispositionCheck = sql`rd_disposition in ('For approval','For information','For appropriate action','Refer to concerned office','Other')`
const statusCheck = sql`status in ('Received','Under Review','For RD Action','Referred','Ongoing','Completed','Closed')`

export const users = pgTable(
  "users",
  {
    id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    passwordHash: text("password_hash"),
    role: text("role").$type<Role>().notNull().default("viewer"),
    status: text("status").notNull().default("active"),
    tokenVersion: integer("token_version").notNull().default(0),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: integer("created_by"),
  },
  (t) => ({
    emailUnique: uniqueIndex("uq_users_email").on(sql`lower(${t.email})`),
    roleIdx: index("idx_users_role").on(t.role),
    statusCheck: sql`CHECK (${roleCheck})`,
  }),
)

export const refreshTokens = pgTable(
  "refresh_tokens",
  {
    id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    userAgent: text("user_agent"),
    ip: text("ip"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("idx_refresh_tokens_user_id").on(t.userId),
    hashUnique: uniqueIndex("uq_refresh_tokens_hash").on(t.tokenHash),
  }),
)

export const offices = pgTable(
  "offices",
  {
    id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
    name: text("name").notNull(),
    code: text("code"),
    active: boolean("active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    nameUnique: uniqueIndex("uq_offices_name").on(sql`lower(${t.name})`),
  }),
)

/**
 * One row = one incoming communication, mirroring the official DTS template.
 * Column names match the field-guide keys 1:1 (No. 11 does not exist in the
 * source template and is deliberately absent here too).
 */
export const documents = pgTable(
  "documents",
  {
    id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
    // 1
    dtsReferenceNo: text("dts_reference_no").notNull(),
    // 2
    dateTimeReceived: timestamp("date_time_received", { withTimezone: true }).notNull(),
    // 3
    modeOfReceipt: text("mode_of_receipt").$type<ModeOfReceipt>().notNull(),
    // 4
    documentType: text("document_type").$type<DocumentType>().notNull(),
    // 5
    dateOfDocument: date("date_of_document", { mode: "string" }),
    // 6
    referenceNo: text("reference_no"),
    // 7
    senderOriginatingOffice: text("sender_originating_office").notNull(),
    // 8
    subjectBriefDescription: text("subject_brief_description").notNull(),
    // 9
    attachments: text("attachments"),
    // 10
    urgencyLevel: text("urgency_level").$type<UrgencyLevel>().notNull().default("Routine"),
    // 12
    rdDisposition: text("rd_disposition").$type<RdDisposition>(),
    // 13
    rdDecisionDate: date("rd_decision_date", { mode: "string" }),
    // 14
    referredAssignedTo: text("referred_assigned_to"),
    // 15
    actionRequired: text("action_required"),
    // 16
    deadlineDueDate: date("deadline_due_date", { mode: "string" }),
    // 17
    status: text("status").$type<DocumentStatus>().notNull().default("Received"),
    // 18
    dateForwarded: date("date_forwarded", { mode: "string" }),
    // 19
    dateActionCompleted: date("date_action_completed", { mode: "string" }),
    // 20
    responseOutgoingReferenceNo: text("response_outgoing_reference_no"),
    // 21
    proofOfTransmissionReceipt: text("proof_of_transmission_receipt"),
    // 22
    remarks: text("remarks"),

    createdBy: integer("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedBy: integer("updated_by").references(() => users.id),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => ({
    refUnique: uniqueIndex("uq_documents_dts_reference_no").on(t.dtsReferenceNo),
    statusIdx: index("idx_documents_status").on(t.status),
    urgencyIdx: index("idx_documents_urgency").on(t.urgencyLevel),
    receivedIdx: index("idx_documents_received").on(t.dateTimeReceived),
    deadlineIdx: index("idx_documents_deadline").on(t.deadlineDueDate),
    assignedIdx: index("idx_documents_assigned").on(t.referredAssignedTo),
    typeIdx: index("idx_documents_type").on(t.documentType),
    modeCheck,
    docTypeCheck,
    urgencyCheck,
    dispositionCheck,
    statusCheck,
  }),
)

export const documentAttachments = pgTable(
  "document_attachments",
  {
    id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
    documentId: integer("document_id")
      .references(() => documents.id, { onDelete: "cascade" })
      .notNull(),
    filename: text("filename").notNull(),
    storageKey: text("storage_key").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    uploadedBy: integer("uploaded_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    documentIdx: index("idx_attachments_document_id").on(t.documentId),
  }),
)

/**
 * Append-only audit trail. Serves two purposes: security events (logins, user
 * changes) and the per-record field history the Records Office must be able to
 * reconstruct. Field-level diffs are stored as `{ field, old, new }` in detail.
 */
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
    userId: integer("user_id").references(() => users.id),
    action: text("action").notNull(),
    entity: text("entity"),
    entityId: text("entity_id"),
    detail: jsonb("detail"),
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("idx_audit_logs_user_id").on(t.userId),
    entityIdx: index("idx_audit_logs_entity").on(t.entity, t.entityId),
    createdIdx: index("idx_audit_logs_created_at").on(t.createdAt),
  }),
)

/** Race-safe counters for auto-generated control numbers (DTS-YYYY-NNNN). */
export const sequences = pgTable("sequences", {
  name: text("name").primaryKey(),
  year: integer("year").notNull(),
  lastValue: integer("last_value").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: text("value"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: integer("updated_by").references(() => users.id),
})
