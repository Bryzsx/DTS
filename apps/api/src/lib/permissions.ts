import type { Role } from "../db/schema.js"

/**
 * Single source of truth for who may do what.
 *
 * The DTS mirrors a real office: Records Officers encode and route incoming
 * communications, the RD (or Records Division head) is the only one who may
 * formally dispose of them, and Viewers exist for audit/printing.
 */

export const PERMISSIONS = {
  createDocument: ["admin", "officer", "rd"],
  editIntake: ["admin", "officer", "rd"],
  editRdDisposition: ["admin", "rd"],
  editRouting: ["admin", "officer", "rd"],
  editCloseout: ["admin", "officer", "rd"],
  archiveDocument: ["admin"],
  uploadAttachment: ["admin", "officer", "rd"],
  deleteAttachment: ["admin", "officer", "rd"],
  manageUsers: ["admin"],
  manageOffices: ["admin"],
  manageSettings: ["admin"],
  viewAuditTrail: ["admin", "officer", "rd", "viewer"],
} as const satisfies Record<string, readonly Role[]>

export type Permission = keyof typeof PERMISSIONS

export function can(role: Role, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly Role[]).includes(role)
}

/**
 * Which permission guards each editable column. Fields not listed here are
 * server-owned (id, audit columns, reference number rules) and are rejected
 * outright if a client tries to set them.
 */
export const FIELD_PERMISSION = {
  // Fields 2-10: intake
  dateTimeReceived: "editIntake",
  modeOfReceipt: "editIntake",
  documentType: "editIntake",
  dateOfDocument: "editIntake",
  referenceNo: "editIntake",
  senderOriginatingOffice: "editIntake",
  subjectBriefDescription: "editIntake",
  attachments: "editIntake",
  urgencyLevel: "editIntake",
  // Fields 12-13: the RD's disposition — RD-only
  rdDisposition: "editRdDisposition",
  rdDecisionDate: "editRdDisposition",
  // Fields 14-19: routing, action, deadline, completion
  referredAssignedTo: "editRouting",
  actionRequired: "editRouting",
  deadlineDueDate: "editRouting",
  status: "editRouting",
  dateForwarded: "editRouting",
  dateActionCompleted: "editRouting",
  // Fields 20-22: response and close-out
  responseOutgoingReferenceNo: "editCloseout",
  proofOfTransmissionReceipt: "editCloseout",
  remarks: "editCloseout",
} as const satisfies Record<string, Permission>

export type EditableField = keyof typeof FIELD_PERMISSION

export const EDITABLE_FIELDS = Object.keys(FIELD_PERMISSION) as EditableField[]

/** Groups used by the UI to lay out the record sheet. */
export const FIELD_GROUPS = [
  { key: "intake", label: "Receipt Details", fieldNos: "2 – 10" },
  { key: "content", label: "Document Content", fieldNos: "5 – 10" },
  { key: "disposition", label: "RD Disposition", fieldNos: "12 – 13" },
  { key: "routing", label: "Routing & Action", fieldNos: "14 – 19" },
  { key: "closeout", label: "Response & Close-out", fieldNos: "20 – 22" },
] as const

/**
 * Allowed status transitions. Anything not listed is rejected so a record can
 * never silently skip the office's workflow.
 */
const TRANSITIONS: Record<string, readonly string[]> = {
  Received: ["Under Review", "For RD Action", "Closed"],
  "Under Review": ["For RD Action", "Closed", "Referred"],
  "For RD Action": ["Referred", "Under Review", "Ongoing", "Closed"],
  Referred: ["Ongoing", "Completed", "Closed"],
  Ongoing: ["Ongoing", "Completed", "Referred", "Closed"],
  Completed: ["Closed", "Ongoing"],
  Closed: ["Under Review"],
}

export interface TransitionCheck {
  allowed: boolean
  reason?: string
}

export function checkTransition(from: string, to: string, role: Role): TransitionCheck {
  if (from === to) return { allowed: true }
  const allowed = TRANSITIONS[from] ?? []
  if (!allowed.includes(to)) {
    return {
      allowed: false,
      reason: `A record at "${from}" cannot move directly to "${to}".`,
    }
  }
  // Reopening a closed record is an administrative act.
  if (from === "Closed" && role !== "admin") {
    return { allowed: false, reason: "Only an administrator can reopen a closed record." }
  }
  return { allowed: true }
}

export const ALLOWED_TRANSITIONS = TRANSITIONS
