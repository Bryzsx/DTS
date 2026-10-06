import { useEffect, useState } from "react"
import { useParams } from "react-router-dom"
import { Letterhead } from "../components/Letterhead"
import { Spinner } from "../components/ui/Spinner"
import { api } from "../lib/api"
import { useAuth } from "../lib/useAuth"
import { useAgency } from "../hooks/useAgency"
import { formatDate, formatDateTime } from "../lib/format"
import type { Attachment, AuditEntry, DtsDocument } from "../lib/types"

/**
 * The single-document record sheet — the print equivalent of one register row,
 * laid out as a form so it can be signed, stamped and filed on paper.
 */
export default function PrintRecordSheet() {
  const { id } = useParams()
  const agency = useAgency()
  const { user } = useAuth()
  const docId = Number(id)

  const [doc, setDoc] = useState<DtsDocument | null>(null)
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [history, setHistory] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [printedAt] = useState(() => new Date())

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [d, a, h] = await Promise.all([
          api<{ document: DtsDocument }>(`/api/documents/${docId}`),
          api<{ attachments: Attachment[] }>(`/api/documents/${docId}/attachments`),
          api<{ history: AuditEntry[] }>(`/api/documents/${docId}/audit`),
        ])
        if (cancelled) return
        setDoc(d.document)
        setAttachments(a.attachments)
        setHistory(h.history)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load this record")
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [docId])

  if (loading) {
    return (
      <div className="p-6">
        <Spinner label="Preparing the record sheet" />
      </div>
    )
  }
  if (error) return <p className="p-6 text-sm text-red-700">{error}</p>
  if (!doc) return null

  return (
    <div className="print-sheet mx-auto max-w-[210mm] p-6">
      <div className="no-print mb-5 flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-4 ring-1 ring-slate-900/10">
        <p className="text-xs text-slate-600">
          Print this sheet for the physical file, or use your browser&apos;s &ldquo;Save as
          PDF&rdquo;.
        </p>
        <button
          onClick={() => window.print()}
          className="rounded-lg bg-navy-800 px-4 py-2 text-xs font-semibold text-white hover:bg-navy-900"
        >
          Print
        </button>
      </div>

      <Letterhead agency={agency} printedAt={printedAt} title="Document Record Sheet" />

      <section className="print-block mt-5 border border-slate-500 px-3 py-2.5">
        <div className="flex items-baseline justify-between gap-4">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-slate-600">
              DTS Reference No.
            </p>
            <p className="font-mono text-lg font-bold text-navy-900">{doc.dtsReferenceNo}</p>
          </div>
          <div className="text-right">
            <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-slate-600">Status</p>
            <p className="text-sm font-bold">{doc.status}</p>
          </div>
        </div>
      </section>

      <section className="print-block">
        <h2 className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-navy-900">
          Receipt
        </h2>
        <div className="grid grid-cols-3 gap-2">
          <Block label="Date & Time Received" value={formatDateTime(doc.dateTimeReceived)} />
          <Block label="Mode of Receipt" value={doc.modeOfReceipt} />
          <Block label="Urgency Level" value={doc.urgencyLevel} />
        </div>
      </section>

      <section className="print-block">
        <h2 className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-navy-900">
          Document identification
        </h2>
        <div className="grid grid-cols-2 gap-2">
          <Block label="Document Type" value={doc.documentType} />
          <Block label="Date of Document" value={formatDate(doc.dateOfDocument)} />
          <Block label="Reference No." value={doc.referenceNo} />
          <Block label="Sender / Originating Office" value={doc.senderOriginatingOffice} />
        </div>
        <div className="mt-2">
          <Block label="Subject / Brief Description" value={doc.subjectBriefDescription} />
        </div>
      </section>

      <section className="print-block">
        <h2 className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-navy-900">
          RD disposition
        </h2>
        <div className="grid grid-cols-2 gap-2">
          <Block label="RD Disposition" value={doc.rdDisposition} />
          <Block label="RD Decision Date" value={formatDate(doc.rdDecisionDate)} />
        </div>
      </section>

      <section className="print-block">
        <h2 className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-navy-900">
          Routing and action
        </h2>
        <div className="grid grid-cols-2 gap-2">
          <Block label="Referred / Assigned To" value={doc.referredAssignedTo} />
          <Block label="Deadline / Due Date" value={formatDate(doc.deadlineDueDate)} />
          <Block label="Date Forwarded" value={formatDate(doc.dateForwarded)} />
          <Block label="Date Action Completed" value={formatDate(doc.dateActionCompleted)} />
        </div>
        <div className="mt-2">
          <Block label="Action Required" value={doc.actionRequired} />
        </div>
      </section>

      <section className="print-block">
        <h2 className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-navy-900">
          Close-out
        </h2>
        <div className="grid grid-cols-2 gap-2">
          <Block label="Response / Outgoing Ref. No." value={doc.responseOutgoingReferenceNo} />
          <Block label="Proof of Transmission / Receipt" value={doc.proofOfTransmissionReceipt} />
        </div>
        <div className="mt-2">
          <Block label="Remarks" value={doc.remarks} />
        </div>
      </section>

      <section className="print-block">
        <h2 className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-navy-900">
          Attachments
        </h2>
        <div className="field-block">
          <p className="field-block-label">Declared on the form</p>
          <p className="field-block-value">{doc.attachments || "None declared"}</p>
          <p className="field-block-label mt-2">Files on record</p>
          <p className="field-block-value">
            {attachments.length > 0
              ? attachments.map((a) => `${a.filename} (${a.contentType})`).join(", ")
              : "No files attached"}
          </p>
        </div>
      </section>

      <section className="print-block">
        <h2 className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-navy-900">
          Audit trail
        </h2>
        <table className="print-table">
          <thead>
            <tr>
              <th className="w-[20%]">When</th>
              <th className="w-[22%]">Who</th>
              <th className="w-[24%]">Action</th>
              <th>Detail</th>
            </tr>
          </thead>
          <tbody>
            {history.length === 0 ? (
              <tr>
                <td colSpan={4}>No recorded changes.</td>
              </tr>
            ) : (
              history.map((h) => (
                <tr key={h.id}>
                  <td>{formatDateTime(h.createdAt)}</td>
                  <td>{h.userName ?? user?.name ?? "System"}</td>
                  <td>{h.action}</td>
                  <td>{h.detail ? JSON.stringify(h.detail) : "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      {/* Signature blocks — the reason this form exists on paper. */}
      <section className="print-block mt-8 grid grid-cols-2 gap-8">
        {["Received by", "Verified by"].map((label) => (
          <div key={label}>
            <div className="h-10 border-b border-slate-500" />
            <p className="mt-1 text-[9px] uppercase tracking-wide text-slate-600">
              {label} — name, signature and date
            </p>
          </div>
        ))}
      </section>

      <footer className="mt-6 flex justify-between border-t border-slate-300 pt-3 text-[9px] text-slate-600">
        <span>
          {agency.agency_name} · {agency.agency_subtitle}
        </span>
        <span>{doc.dtsReferenceNo}</span>
      </footer>
    </div>
  )
}

function Block({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="field-block">
      <p className="field-block-label">{label}</p>
      <p className="field-block-value">{value || "—"}</p>
    </div>
  )
}
