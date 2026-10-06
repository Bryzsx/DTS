import type { DocumentStatus, UrgencyLevel } from "../lib/types.js"

/** Maps a workflow status to its badge class. */
export function statusBadgeClass(status: DocumentStatus): string {
  switch (status) {
    case "Received":
      return "badge-received"
    case "Under Review":
      return "badge-review"
    case "For RD Action":
      return "badge-rd"
    case "Referred":
    case "Ongoing":
      return "badge-active"
    case "Completed":
    case "Closed":
      return "badge-done"
    default:
      return "badge-slate"
  }
}

export function urgencyBadgeClass(level: UrgencyLevel): string {
  switch (level) {
    case "Urgent":
      return "badge-urgent"
    case "High Priority":
      return "badge-high"
    default:
      return "badge-routine"
  }
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—"
  // Date-only strings are rendered as-is so they never shift a day across timezones.
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return formatDateOnly(value)
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" })
}

function formatDateOnly(value: string): string {
  const [y, m, d] = value.split("-")
  const date = new Date(Number(y), Number(m) - 1, Number(d))
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" })
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—"
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return "—"
  return `${d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" })} · ${d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Today as YYYY-MM-DD in the browser's own timezone. */
export function todayInput(): string {
  const d = new Date()
  const m = `${d.getMonth() + 1}`.padStart(2, "0")
  const day = `${d.getDate()}`.padStart(2, "0")
  return `${d.getFullYear()}-${m}-${day}`
}

/** True when a due date is in the past and the record is still open. */
export function isOverdue(deadline: string | null, status: DocumentStatus): boolean {
  if (!deadline) return false
  if (status === "Completed" || status === "Closed") return false
  return deadline < todayInput()
}

export function daysUntil(deadline: string): number {
  const target = new Date(`${deadline}T00:00:00`)
  const now = new Date(`${todayInput()}T00:00:00`)
  return Math.round((target.getTime() - now.getTime()) / 86400000)
}
