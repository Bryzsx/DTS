export type Role = "admin" | "officer" | "rd" | "viewer"

export type DocumentStatus =
  "Received" | "Under Review" | "For RD Action" | "Referred" | "Ongoing" | "Completed" | "Closed"

export type UrgencyLevel = "Urgent" | "High Priority" | "Routine"

export type ModeOfReceipt = "Email" | "Courier" | "Hand-carried" | "Other"

export type DocumentType =
  "Letter" | "Memorandum" | "Request" | "Invitation" | "Endorsement" | "Report" | "Other"

export type RDDisposition =
  | "Noted"
  | "For Signature"
  | "For Information"
  | "For Comment"
  | "For Action"
  | "Referred to Concerned Office"
  | "Return to Sender"
  | "Other"

export interface SessionUser {
  id: number
  name: string
  email: string
  role: Role
}

export interface DtsDocument {
  id: number
  dtsReferenceNo: string
  dateTimeReceived: string
  modeOfReceipt: ModeOfReceipt
  documentType: DocumentType
  dateOfDocument: string | null
  referenceNo: string | null
  senderOriginatingOffice: string | null
  subjectBriefDescription: string
  attachments: string | null
  urgencyLevel: UrgencyLevel
  rdDisposition: RDDisposition | null
  rdDecisionDate: string | null
  referredAssignedTo: string | null
  actionRequired: string | null
  deadlineDueDate: string | null
  status: DocumentStatus
  dateForwarded: string | null
  dateActionCompleted: string | null
  responseOutgoingReferenceNo: string | null
  proofOfTransmissionReceipt: string | null
  remarks: string | null
  createdBy: number | null
  assignedTo: number | null
  archivedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface DocumentListResponse {
  documents: DtsDocument[]
  total: number
  page: number
  pageCount: number
}

export interface Attachment {
  id: number
  filename: string
  contentType: string
  sizeBytes: number
  createdAt: string
  uploadedBy?: number | null
}

export interface AuditEntry {
  id: number
  action: string
  entity: string | null
  entityId: number | null
  detail: Record<string, unknown> | null
  ip: string | null
  createdAt: string
  userId: number | null
  userName?: string | null
}

export interface Office {
  id: number
  name: string
  code: string | null
  sortOrder: number
  active: boolean
}

export interface AgencySettings {
  agency_name: string
  agency_subtitle: string
  agency_seal_url: string
  register_title: string
}

export interface DashboardStats {
  total: number
  open: number
  overdue: number
  dueThisWeek: number
  closedLast12Months: number
  byStatus: { status: DocumentStatus; count: number }[]
  byUrgency: { urgencyLevel: UrgencyLevel; count: number }[]
  intakeByMonth: { month: string; count: number }[]
  byOffice: { office: string; count: number }[]
  offices: string[]
  overdueList: Pick<
    DtsDocument,
    | "id"
    | "dtsReferenceNo"
    | "subjectBriefDescription"
    | "deadlineDueDate"
    | "referredAssignedTo"
    | "status"
  >[]
  upcomingList: Pick<
    DtsDocument,
    | "id"
    | "dtsReferenceNo"
    | "subjectBriefDescription"
    | "deadlineDueDate"
    | "referredAssignedTo"
    | "status"
  >[]
}

export const STATUSES: DocumentStatus[] = [
  "Received",
  "Under Review",
  "For RD Action",
  "Referred",
  "Ongoing",
  "Completed",
  "Closed",
]

export const URGENCY_LEVELS: UrgencyLevel[] = ["Urgent", "High Priority", "Routine"]

export const MODES_OF_RECEIPT: ModeOfReceipt[] = ["Email", "Courier", "Hand-carried", "Other"]

export const DOCUMENT_TYPES: DocumentType[] = [
  "Letter",
  "Memorandum",
  "Request",
  "Invitation",
  "Endorsement",
  "Report",
  "Other",
]

export const RD_DISPOSITIONS: RDDisposition[] = [
  "Noted",
  "For Signature",
  "For Information",
  "For Comment",
  "For Action",
  "Referred to Concerned Office",
  "Return to Sender",
  "Other",
]

export const OPEN_STATUSES: DocumentStatus[] = [
  "Received",
  "Under Review",
  "For RD Action",
  "Referred",
  "Ongoing",
]
