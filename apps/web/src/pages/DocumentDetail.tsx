import { useCallback, useEffect, useState } from "react"
import { Link, useParams } from "react-router-dom"
import { PageHeader } from "../components/ui/PageHeader"
import { Spinner } from "../components/ui/Spinner"
import { api, downloadFile, uploadAttachment } from "../lib/api"
import { useAuth } from "../lib/useAuth"
import { allowedTransitions, can, canReopen } from "../lib/permissions"
import {
  formatBytes,
  formatDate,
  formatDateTime,
  isOverdue,
  statusBadgeClass,
  urgencyBadgeClass,
} from "../lib/format"
import type { Attachment, AuditEntry, DtsDocument, DocumentStatus } from "../lib/types"

interface OfficeOption {
  id: number
  name: string
}

const TABS = ["record", "attachments", "history"] as const
type Tab = (typeof TABS)[number]

export default function DocumentDetail() {
  const { id } = useParams()
  const { user } = useAuth()
  const [doc, setDoc] = useState<DtsDocument | null>(null)
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [history, setHistory] = useState<AuditEntry[]>([])
  const [offices, setOffices] = useState<OfficeOption[]>([])
  const [tab, setTab] = useState<Tab>("record")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const docId = Number(id)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [d, a] = await Promise.all([
        api<{ document: DtsDocument }>(`/api/documents/${docId}`),
        api<{ attachments: Attachment[] }>(`/api/documents/${docId}/attachments`),
      ])
      setDoc(d.document)
      setAttachments(a.attachments)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load this record")
    } finally {
      setLoading(false)
    }
  }, [docId])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    api<{ offices: OfficeOption[] }>("/api/admin/offices")
      .then((r) => setOffices(r.offices))
      .catch(() => setOffices([]))
  }, [])

  // The history tab loads on demand rather than on every visit.
  useEffect(() => {
    if (tab !== "history" || history.length > 0) return
    api<{ history: AuditEntry[] }>(`/api/documents/${docId}/audit`)
      .then((r) => setHistory(r.history))
      .catch(() => setHistory([]))
  }, [tab, docId, history.length])

  async function changeStatus(next: string) {
    if (!doc) return
    setBusy(true)
    setNotice(null)
    try {
      await api(`/api/documents/${doc.id}`, { method: "PATCH", body: { status: next } })
      setNotice(`Status changed to ${next}.`)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change the status")
    } finally {
      setBusy(false)
    }
  }

  async function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file || !doc) return
    setBusy(true)
    setUploadError(null)
    try {
      await uploadAttachment(doc.id, file)
      setNotice(`${file.name} attached.`)
      const a = await api<{ attachments: Attachment[] }>(`/api/documents/${doc.id}/attachments`)
      setAttachments(a.attachments)
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed")
    } finally {
      setBusy(false)
    }
  }

  async function onDeleteAttachment(attachmentId: number) {
    if (!confirm("Remove this attachment? The file will be deleted permanently.")) return
    setBusy(true)
    try {
      await api(`/api/attachments/${attachmentId}`, { method: "DELETE" })
      setAttachments((prev) => prev.filter((a) => a.id !== attachmentId))
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Could not remove the attachment")
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <Spinner label="Loading record" />
  if (error && !doc) return <div className="alert-error">{error}</div>
  if (!doc) return null

  const role = user?.role ?? "viewer"
  const overdue = isOverdue(doc.deadlineDueDate, doc.status)
  const transitions = allowedTransitions(doc.status)
  const archived = Boolean(doc.archivedAt)

  return (
    <>
      <PageHeader
        eyebrow={doc.dtsReferenceNo}
        title={doc.subjectBriefDescription}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <span className={statusBadgeClass(doc.status)}>{doc.status}</span>
            <span className={urgencyBadgeClass(doc.urgencyLevel)}>{doc.urgencyLevel}</span>
            {overdue && <span className="badge-overdue">Past due</span>}
            {archived && <span className="badge-done">Archived</span>}
          </span>
        }
        actions={
          <>
            <Link
              to={`/print/document/${doc.id}`}
              target="_blank"
              rel="noreferrer"
              className="btn-secondary btn-sm"
            >
              Print record sheet
            </Link>
            {can(role, "editIntake") && !archived && (
              <Link to={`/documents/${doc.id}/edit`} className="btn-primary btn-sm">
                Edit
              </Link>
            )}
          </>
        }
      />

      {notice && (
        <p className="alert-success mb-4 flex items-center justify-between gap-4" role="status">
          <span>{notice}</span>
          <button
            onClick={() => setNotice(null)}
            className="shrink-0 text-sm font-semibold underline underline-offset-2"
          >
            Dismiss
          </button>
        </p>
      )}

      {/* Workflow bar */}
      {transitions.length > 0 && can(role, "editRouting") && !archived && (
        <div className="card mb-6 flex flex-wrap items-center gap-2 p-4">
          <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Move to
          </span>
          {transitions.map((t) => (
            <button
              key={t}
              disabled={busy}
              onClick={() => changeStatus(t)}
              className="btn-secondary btn-sm"
            >
              {t}
            </button>
          ))}
        </div>
      )}
      {doc.status === "Closed" && !canReopen(role) && (
        <p className="alert-warning mb-6">
          This record is closed. Only an administrator can reopen it.
        </p>
      )}

      <div
        className="mb-5 flex gap-1 border-b border-slate-200 dark:border-slate-700"
        role="tablist"
      >
        {TABS.map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold capitalize transition-colors ${
              tab === t
                ? "border-navy-700 text-navy-800 dark:border-navy-400 dark:text-navy-200"
                : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
            }`}
          >
            {t === "record"
              ? "Record"
              : t === "attachments"
                ? `Attachments (${attachments.length})`
                : "History"}
          </button>
        ))}
      </div>

      {tab === "record" && (
        <div className="card p-5 sm:p-6">
          <FieldGrid doc={doc} />
        </div>
      )}

      {tab === "attachments" && (
        <div className="card p-5 sm:p-6">
          {can(role, "uploadAttachment") && !archived && (
            <div className="mb-5">
              <label htmlFor="file" className="label">
                Attach a file
              </label>
              <input
                id="file"
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp"
                onChange={onFile}
                disabled={busy}
                className="input file:mr-3 file:rounded-lg file:border-0 file:bg-navy-800 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white hover:file:bg-navy-900"
              />
              <p className="hint">PDF, JPG, PNG or WEBP. Maximum 10 MB per file.</p>
              {uploadError && <p className="field-error">{uploadError}</p>}
            </div>
          )}

          {attachments.length === 0 ? (
            <p className="text-sm text-slate-500">No files attached to this record.</p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {attachments.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900 dark:text-white">
                      {a.filename}
                    </p>
                    <p className="text-xs text-slate-500">
                      {formatBytes(a.sizeBytes)} · {formatDateTime(a.createdAt)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      onClick={() =>
                        downloadFile(
                          `/api/attachments/${a.id}/file?disposition=inline`,
                          a.filename,
                        ).catch((err: unknown) =>
                          window.alert(err instanceof Error ? err.message : "Download failed"),
                        )
                      }
                      className="btn-secondary btn-sm"
                    >
                      Open
                    </button>
                    <button
                      onClick={() =>
                        downloadFile(`/api/attachments/${a.id}/file`, a.filename).catch(
                          (err: unknown) =>
                            window.alert(err instanceof Error ? err.message : "Download failed"),
                        )
                      }
                      className="btn-ghost btn-sm"
                    >
                      Download
                    </button>
                    {can(role, "deleteAttachment") && !archived && (
                      <button
                        onClick={() => onDeleteAttachment(a.id)}
                        className="btn-ghost btn-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === "history" && (
        <div className="card p-5 sm:p-6">
          {history.length === 0 ? (
            <p className="text-sm text-slate-500">No recorded changes yet.</p>
          ) : (
            <ol className="space-y-4">
              {history.map((entry) => (
                <li
                  key={entry.id}
                  className="border-l-2 border-slate-200 pl-4 dark:border-slate-700"
                >
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">
                    {humaniseAction(entry.action)}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {entry.userName ?? "System"} · {formatDateTime(entry.createdAt)}
                  </p>
                  {entry.detail && Object.keys(entry.detail).length > 0 && (
                    <p className="mt-1 font-mono text-[11px] text-slate-500">
                      {summariseDetail(entry.detail)}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </>
  )
}

const FIELDS: { key: keyof DtsDocument; label: string }[] = [
  { key: "dtsReferenceNo", label: "DTS Reference No." },
  { key: "dateTimeReceived", label: "Date & Time Received" },
  { key: "modeOfReceipt", label: "Mode of Receipt" },
  { key: "documentType", label: "Document Type" },
  { key: "dateOfDocument", label: "Date of Document" },
  { key: "referenceNo", label: "Reference No." },
  { key: "senderOriginatingOffice", label: "Sender / Originating Office" },
  { key: "subjectBriefDescription", label: "Subject / Brief Description" },
  { key: "attachments", label: "Attachments (description)" },
  { key: "urgencyLevel", label: "Urgency Level" },
  { key: "rdDisposition", label: "RD Disposition" },
  { key: "rdDecisionDate", label: "RD Decision Date" },
  { key: "referredAssignedTo", label: "Referred / Assigned To" },
  { key: "actionRequired", label: "Action Required" },
  { key: "deadlineDueDate", label: "Deadline / Due Date" },
  { key: "status", label: "Status" },
  { key: "dateForwarded", label: "Date Forwarded" },
  { key: "dateActionCompleted", label: "Date Action Completed" },
  { key: "responseOutgoingReferenceNo", label: "Response / Outgoing Ref. No." },
  { key: "proofOfTransmissionReceipt", label: "Proof of Transmission / Receipt" },
  { key: "remarks", label: "Remarks" },
]

function renderValue(field: keyof DtsDocument, doc: DtsDocument): string {
  const value = doc[field]
  if (value === null || value === undefined || value === "") return "—"
  if (field === "dateTimeReceived" || field === "createdAt" || field === "updatedAt") {
    return formatDateTime(String(value))
  }
  if (field.includes("Date")) return formatDate(String(value))
  return String(value)
}

function FieldGrid({ doc }: { doc: DtsDocument }) {
  return (
    <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
      {FIELDS.map((f) => (
        <div
          key={f.key}
          className={
            f.key === "subjectBriefDescription" || f.key === "actionRequired" || f.key === "remarks"
              ? "sm:col-span-2"
              : ""
          }
        >
          <dt className="kv-label">{f.label}</dt>
          <dd className="kv-value">{renderValue(f.key, doc)}</dd>
        </div>
      ))}
    </dl>
  )
}

function humaniseAction(action: string): string {
  return action.replace(/[._]/g, " ").replace(/^\w/, (c) => c.toUpperCase())
}

function summariseDetail(detail: Record<string, unknown>): string {
  const parts: string[] = []
  for (const [key, value] of Object.entries(detail)) {
    if (key === "ip") continue
    if (value !== null && typeof value === "object") {
      const inner = value as Record<string, unknown>
      const field = inner.field
      const from = inner.from
      const to = inner.to
      if (field) parts.push(`${String(field)}: ${String(from ?? "—")} → ${String(to ?? "—")}`)
      else parts.push(`${key}: ${JSON.stringify(value)}`)
    } else {
      parts.push(`${key}: ${String(value)}`)
    }
  }
  return parts.join(" · ")
}

export { FIELDS }
