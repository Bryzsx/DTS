import type { Role } from "./types.js"

/**
 * UI mirror of apps/api/src/lib/permissions.ts.
 *
 * The API is the authority — every request is re-checked there. This copy only
 * hides controls a role cannot use, so the interface never offers an action
 * that comes back as a 403. The two files must stay in step.
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
/** Alias kept so route guards can name the concept directly. */
export type PermissionAction = Permission

export function can(role: Role, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly Role[]).includes(role)
}

/** Allowed status transitions. Mirrors the server table exactly. */
export const ALLOWED_TRANSITIONS: Record<string, readonly string[]> = {
  Received: ["Under Review", "For RD Action", "Closed"],
  "Under Review": ["For RD Action", "Closed", "Referred"],
  "For RD Action": ["Referred", "Under Review", "Ongoing", "Closed"],
  Referred: ["Ongoing", "Completed", "Closed"],
  Ongoing: ["Ongoing", "Completed", "Referred", "Closed"],
  Completed: ["Closed", "Ongoing"],
  Closed: ["Under Review"],
}

export function allowedTransitions(status: string): readonly string[] {
  return ALLOWED_TRANSITIONS[status] ?? []
}

/** Fields 12–13: only an administrator or the RD may change these. */
export const DISPOSITION_FIELDS = ["rdDisposition", "rdDecisionDate"] as const
export type DispositionField = (typeof DISPOSITION_FIELDS)[number]

export function isDispositionField(field: string): field is DispositionField {
  return (DISPOSITION_FIELDS as readonly string[]).includes(field)
}

/** True when the given role may reopen a closed record. */
export function canReopen(role: Role): boolean {
  return role === "admin"
}
