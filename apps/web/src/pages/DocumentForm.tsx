import { useCallback, useEffect, useMemo, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { PageHeader } from "../components/ui/PageHeader"
import { Spinner } from "../components/ui/Spinner"
import { api } from "../lib/api"
import { useAuth } from "../lib/useAuth"
import { can } from "../lib/permissions"
import { todayInput } from "../lib/format"
import {
  DOCUMENT_TYPES,
  MODES_OF_RECEIPT,
  RD_DISPOSITIONS,
  STATUSES,
  URGENCY_LEVELS,
  type DocumentStatus,
  type DocumentType,
  type DtsDocument,
  type ModeOfReceipt,
  type Office,
  type UrgencyLevel,
} from "../lib/types"

/**
 * Every value is a plain string while the form is being edited: `""` means
 * "not filled in" and is converted to null on save. Modelling optional fields
 * as `| null` here would make each input a null-check.
 */
interface FormState {
  dateTimeReceived: string
  modeOfReceipt: ModeOfReceipt
  documentType: DocumentType
  dateOfDocument: string
  referenceNo: string
  senderOriginatingOffice: string
  subjectBriefDescription: string
  attachments: string
  urgencyLevel: UrgencyLevel
  rdDisposition: string
  rdDecisionDate: string
  referredAssignedTo: string
  actionRequired: string
  deadlineDueDate: string
  status: DocumentStatus
  dateForwarded: string
  dateActionCompleted: string
  responseOutgoingReferenceNo: string
  proofOfTransmissionReceipt: string
  remarks: string
}

const BLANK: FormState = {
  dateTimeReceived: "",
  modeOfReceipt: "Hand-carried",
  documentType: "Letter",
  dateOfDocument: "",
  referenceNo: "",
  senderOriginatingOffice: "",
  subjectBriefDescription: "",
  attachments: "",
  urgencyLevel: "Routine",
  rdDisposition: "",
  rdDecisionDate: "",
  referredAssignedTo: "",
  actionRequired: "",
  deadlineDueDate: "",
  status: "Received",
  dateForwarded: "",
  dateActionCompleted: "",
  responseOutgoingReferenceNo: "",
  proofOfTransmissionReceipt: "",
  remarks: "",
}

interface FieldDef {
  key: keyof FormState
  label: string
  type: "text" | "textarea" | "date" | "datetime-local" | "select" | "office"
  width?: "half" | "full"
  required?: boolean
  hint?: string
  /** RD-only fields render read-only for other roles. */
  disposition?: boolean
  options?: readonly string[]
}

interface SectionDef {
  title: string
  hint: string
  fields: FieldDef[]
}

/** Groups matching the official paper form, so intake mirrors the template. */
const SECTIONS: SectionDef[] = [
  {
    title: "Receipt",
    hint: "How and when the document arrived.",
    fields: [
      {
        key: "dateTimeReceived",
        label: "Date & Time Received",
        type: "datetime-local",
        width: "half",
      },
      {
        key: "modeOfReceipt",
        label: "Mode of Receipt",
        type: "select",
        options: MODES_OF_RECEIPT,
        width: "half",
      },
    ],
  },
  {
    title: "Identification",
    hint: "The document's own details and where it came from.",
    fields: [
      {
        key: "documentType",
        label: "Document Type",
        type: "select",
        options: DOCUMENT_TYPES,
        width: "half",
      },
      { key: "dateOfDocument", label: "Date of Document", type: "date", width: "half" },
      { key: "referenceNo", label: "Reference No.", type: "text", width: "half" },
      {
        key: "senderOriginatingOffice",
        label: "Sender / Originating Office",
        type: "text",
        required: true,
        width: "half",
      },
      {
        key: "subjectBriefDescription",
        label: "Subject / Brief Description",
        type: "textarea",
        required: true,
        width: "full",
      },
      {
        key: "attachments",
        label: "Attachments (description)",
        type: "text",
        hint: "Describe what is attached. Files can be uploaded after saving.",
        width: "full",
      },
    ],
  },
  {
    title: "Priority and disposition",
    hint: "Urgency, and the decision recorded by the RD.",
    fields: [
      {
        key: "urgencyLevel",
        label: "Urgency Level",
        type: "select",
        options: URGENCY_LEVELS,
        width: "half",
      },
      {
        key: "rdDisposition",
        label: "RD Disposition",
        type: "select",
        options: RD_DISPOSITIONS,
        disposition: true,
        width: "half",
      },
      {
        key: "rdDecisionDate",
        label: "RD Decision Date",
        type: "date",
        disposition: true,
        width: "half",
      },
    ],
  },
  {
    title: "Routing and action",
    hint: "Where it went, what is needed, and by when.",
    fields: [
      { key: "referredAssignedTo", label: "Referred / Assigned To", type: "office", width: "half" },
      { key: "actionRequired", label: "Action Required", type: "textarea", width: "full" },
      { key: "deadlineDueDate", label: "Deadline / Due Date", type: "date", width: "half" },
      { key: "status", label: "Status", type: "select", options: STATUSES, width: "half" },
    ],
  },
  {
    title: "Close-out",
    hint: "Completed once action is finished.",
    fields: [
      { key: "dateForwarded", label: "Date Forwarded", type: "date", width: "half" },
      { key: "dateActionCompleted", label: "Date Action Completed", type: "date", width: "half" },
      {
        key: "responseOutgoingReferenceNo",
        label: "Response / Outgoing Ref. No.",
        type: "text",
        width: "half",
      },
      {
        key: "proofOfTransmissionReceipt",
        label: "Proof of Transmission / Receipt",
        type: "text",
        width: "half",
      },
      { key: "remarks", label: "Remarks", type: "textarea", width: "full" },
    ],
  },
]

type FieldKey = keyof FormState

export default function DocumentForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const isEdit = Boolean(id)
  const docId = Number(id)

  const [form, setForm] = useState<FormState>({ ...BLANK })
  const [offices, setOffices] = useState<Office[]>([])
  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)

  const role = user?.role ?? "viewer"
  const canEditDisposition = can(role, "editRdDisposition")

  useEffect(() => {
    api<{ offices: Office[] }>("/api/admin/offices")
      .then((r) => setOffices(r.offices.filter((o) => o.active)))
      .catch(() => setOffices([]))
  }, [])

  useEffect(() => {
    if (!isEdit) {
      // Pre-fill the receipt timestamp — the overwhelming majority of
      // intakes happen at the moment of encoding.
      setForm((f) => ({
        ...f,
        dateTimeReceived: toLocalInput(new Date()),
        deadlineDueDate: "",
      }))
      return
    }
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const { document: doc } = await api<{ document: DtsDocument }>(`/api/documents/${docId}`)
        if (cancelled) return
        setForm({
          dateTimeReceived: toLocalInput(new Date(doc.dateTimeReceived)),
          modeOfReceipt: doc.modeOfReceipt,
          documentType: doc.documentType,
          dateOfDocument: doc.dateOfDocument ?? "",
          referenceNo: doc.referenceNo ?? "",
          senderOriginatingOffice: doc.senderOriginatingOffice ?? "",
          subjectBriefDescription: doc.subjectBriefDescription,
          attachments: doc.attachments ?? "",
          urgencyLevel: doc.urgencyLevel,
          rdDisposition: doc.rdDisposition ?? "",
          rdDecisionDate: doc.rdDecisionDate ?? "",
          referredAssignedTo: doc.referredAssignedTo ?? "",
          actionRequired: doc.actionRequired ?? "",
          deadlineDueDate: doc.deadlineDueDate ?? "",
          status: doc.status,
          dateForwarded: doc.dateForwarded ?? "",
          dateActionCompleted: doc.dateActionCompleted ?? "",
          responseOutgoingReferenceNo: doc.responseOutgoingReferenceNo ?? "",
          proofOfTransmissionReceipt: doc.proofOfTransmissionReceipt ?? "",
          remarks: doc.remarks ?? "",
        })
      } catch (err) {
        if (!cancelled)
          setFormError(err instanceof Error ? err.message : "Could not load this record")
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [isEdit, docId])

  /**
   * Every control reports a plain string; the enum-backed fields are cast back
   * to their union here, and the server re-validates each value anyway.
   */
  const set = useCallback((key: FieldKey, value: string) => {
    setForm((f) => ({ ...f, [key]: value }) as FormState)
    setErrors((e) => (e[key] ? { ...e, [key]: undefined } : e))
  }, [])

  function validate(): boolean {
    const next: Partial<Record<FieldKey, string>> = {}
    if (!form.subjectBriefDescription.trim()) {
      next.subjectBriefDescription = "A subject is required"
    } else if (form.subjectBriefDescription.trim().length > 500) {
      next.subjectBriefDescription = "Keep this under 500 characters"
    }
    if (!form.senderOriginatingOffice.trim()) {
      next.senderOriginatingOffice = "Name the sender or originating office"
    }
    if (!form.dateTimeReceived) next.dateTimeReceived = "Record when the document was received"
    if (form.rdDecisionDate && form.dateForwarded && form.rdDecisionDate < form.dateForwarded) {
      next.rdDecisionDate = "The RD decision date cannot precede the forwarding date"
    }
    if (
      form.dateActionCompleted &&
      form.dateForwarded &&
      form.dateActionCompleted < form.dateForwarded
    ) {
      next.dateActionCompleted = "This date cannot precede the forwarding date"
    }
    setErrors(next)
    if (Object.keys(next).length > 0) {
      document.querySelector<HTMLElement>("[data-invalid='true']")?.focus()
      return false
    }
    return true
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    if (!validate()) return

    // Empty strings become null so the record stores "not yet filled in"
    // rather than a blank-looking value.
    const payload: Record<string, unknown> = { ...form }
    for (const [k, v] of Object.entries(payload)) {
      if (v === "") payload[k] = null
    }
    // A disposition change is meaningless without its date, and vice versa.
    if (!payload.rdDisposition) payload.rdDecisionDate = null
    if (!canEditDisposition) {
      delete payload.rdDisposition
      delete payload.rdDecisionDate
    }

    setSaving(true)
    try {
      if (isEdit) {
        await api(`/api/documents/${docId}`, { method: "PATCH", body: payload })
        navigate(`/documents/${docId}`)
      } else {
        const res = await api<{ document: DtsDocument }>("/api/documents", {
          method: "POST",
          body: payload,
        })
        // Attachments are uploaded against a saved record, so intake always
        // lands on the detail page where the reference number is visible.
        navigate(`/documents/${res.document.id}`)
      }
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not save this document")
    } finally {
      setSaving(false)
    }
  }

  const title = useMemo(() => (isEdit ? "Edit document" : "Intake document"), [isEdit])

  if (loading) return <Spinner label="Loading record" />

  return (
    <>
      <PageHeader
        eyebrow={isEdit ? "Amend record" : "New entry"}
        title={title}
        subtitle={
          isEdit
            ? "Changes are recorded in the audit trail against your name."
            : "Fields follow the official DTS form. The reference number is issued on save."
        }
      />

      <form onSubmit={onSubmit} noValidate>
        {formError && (
          <p className="alert-error mb-5" role="alert">
            {formError}
          </p>
        )}

        <div className="space-y-5">
          {SECTIONS.map((section) => {
            return (
              <fieldset key={section.title} className="card p-5 sm:p-6" disabled={saving}>
                <legend className="px-1">
                  <span className="block text-sm font-bold text-slate-900 dark:text-white">
                    {section.title}
                  </span>
                  <span className="mt-0.5 block text-xs text-slate-500">{section.hint}</span>
                </legend>

                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  {section.fields.map((field) => {
                    const key = field.key
                    const locked = Boolean(field.disposition) && !canEditDisposition
                    const invalid = Boolean(errors[key])
                    const widthClass =
                      field.width === "full" || field.type === "textarea" ? "sm:col-span-2" : ""

                    return (
                      <div
                        key={String(key)}
                        className={widthClass}
                        data-invalid={invalid ? "true" : undefined}
                      >
                        <label htmlFor={String(key)} className="label">
                          {field.label}
                          {field.required && (
                            <span className="ml-1 text-red-600" aria-hidden="true">
                              *
                            </span>
                          )}
                        </label>

                        {field.type === "select" ? (
                          <select
                            id={String(key)}
                            className="input"
                            value={String(form[key] ?? "")}
                            disabled={locked}
                            onChange={(e) => set(key, e.target.value)}
                            aria-describedby={invalid ? `${key}-error` : undefined}
                          >
                            <option value="">Not set</option>
                            {(field.options ?? []).map((o) => (
                              <option key={o} value={o}>
                                {o}
                              </option>
                            ))}
                          </select>
                        ) : field.type === "textarea" ? (
                          <textarea
                            id={String(key)}
                            className="input min-h-[5rem] resize-y"
                            value={String(form[key] ?? "")}
                            disabled={locked}
                            onChange={(e) => set(key, e.target.value)}
                            aria-invalid={invalid}
                            aria-describedby={invalid ? `${key}-error` : undefined}
                          />
                        ) : field.type === "office" ? (
                          <>
                            <input
                              id={String(key)}
                              className="input"
                              list="office-options"
                              value={String(form[key] ?? "")}
                              onChange={(e) => set(key, e.target.value)}
                              placeholder="Type or choose an office"
                            />
                            <datalist id="office-options">
                              {offices.map((o) => (
                                <option key={o.id} value={o.name}>
                                  {o.code ? ` (${o.code})` : ""}
                                </option>
                              ))}
                            </datalist>
                          </>
                        ) : (
                          <input
                            id={String(key)}
                            type={field.type}
                            className="input"
                            value={String(form[key] ?? "")}
                            disabled={locked}

                            onChange={(e) => set(key, e.target.value)}
                            aria-invalid={invalid}
                            aria-describedby={invalid ? `${key}-error` : undefined}
                          />
                        )}

                        {invalid && (
                          <p id={`${key}-error`} className="field-error">
                            {errors[key]}
                          </p>
                        )}
                        {locked && (
                          <p className="hint">
                            Only an administrator or the RD may change this field.
                          </p>
                        )}
                      </div>
                    )
                  })}
                </div>

                {section.fields.some((f) => f.disposition) && !canEditDisposition && (
                  <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
                    The RD disposition block is read-only for your role. It stays as recorded.
                  </p>
                )}
              </fieldset>
            )
          })}
        </div>

        <div className="sticky bottom-0 mt-6 flex flex-wrap items-center justify-end gap-3 border-t border-slate-200 bg-white/95 py-4 backdrop-blur dark:border-slate-700 dark:bg-slate-950/95">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="btn-secondary"
            disabled={saving}
          >
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? "Saving…" : isEdit ? "Save changes" : "Save and issue reference"}
          </button>
        </div>
      </form>
    </>
  )
}

/** Formats a Date as YYYY-MM-DDTHH:mm in the browser's timezone. */
function toLocalInput(d: Date): string {
  const pad = (n: number) => `${n}`.padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export { SECTIONS, todayInput }
