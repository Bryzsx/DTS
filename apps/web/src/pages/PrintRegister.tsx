import { useState } from "react"
import { useSearchParams } from "react-router-dom"
import { Letterhead } from "../components/Letterhead"
import { Spinner } from "../components/ui/Spinner"
import { useAgency, useRegisterData } from "../hooks/useAgency"
import { formatDate } from "../lib/format"
import type { DtsDocument } from "../lib/types"

/**
 * The printable register.
 *
 * Field order and column layout mirror the paper register so a printed copy can
 * be filed alongside the digital one without reconciliation.
 */
export default function PrintRegister() {
  const agency = useAgency()
  const [params, setParams] = useSearchParams()
  const from = params.get("from") ?? ""
  const to = params.get("to") ?? ""
  const { documents, loading, error } = useRegisterData(from, to)
  const [printedAt] = useState(() => new Date())

  return (
    <div className="print-sheet mx-auto max-w-[297mm] p-6">
      <div className="no-print mb-5 flex flex-wrap items-end justify-between gap-3 rounded-xl bg-slate-50 p-4 ring-1 ring-slate-900/10">
        <div>
          <h1 className="text-sm font-bold text-navy-900">Printable register</h1>
          <p className="mt-0.5 text-xs text-slate-600">
            {documents.length} {documents.length === 1 ? "record" : "records"}
            {from || to ? " in the selected date range" : " in total"}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label
              htmlFor="p-from"
              className="mb-1 block text-[10px] font-semibold uppercase text-slate-500"
            >
              From
            </label>
            <input
              id="p-from"
              type="date"
              value={from}
              onChange={(e) => {
                const next = new URLSearchParams(params)
                if (e.target.value) next.set("from", e.target.value)
                else next.delete("from")
                setParams(next)
              }}
              className="rounded-lg border border-slate-300 px-2 py-1 text-xs"
            />
          </div>
          <div>
            <label
              htmlFor="p-to"
              className="mb-1 block text-[10px] font-semibold uppercase text-slate-500"
            >
              To
            </label>
            <input
              id="p-to"
              type="date"
              value={to}
              onChange={(e) => {
                const next = new URLSearchParams(params)
                if (e.target.value) next.set("to", e.target.value)
                else next.delete("to")
                setParams(next)
              }}
              className="rounded-lg border border-slate-300 px-2 py-1 text-xs"
            />
          </div>
          <button
            onClick={() => window.print()}
            className="rounded-lg bg-navy-800 px-4 py-2 text-xs font-semibold text-white hover:bg-navy-900"
          >
            Print
          </button>
        </div>
      </div>

      <Letterhead agency={agency} printedAt={printedAt} title={agency.register_title} />

      {error && <p className="mt-4 text-sm text-red-700">{error}</p>}
      {loading ? (
        <Spinner label="Preparing the register" />
      ) : documents.length === 0 ? (
        <p className="mt-6 text-sm text-slate-600">No records in this date range.</p>
      ) : (
        <table className="print-table mt-5">
          <thead>
            <tr>
              <th className="w-[6%]">No.</th>
              <th className="w-[9%]">DTS Ref.</th>
              <th className="w-[9%]">Date Received</th>
              <th className="w-[7%]">Mode</th>
              <th className="w-[8%]">Type</th>
              <th className="w-[24%]">Subject / Brief Description</th>
              <th className="w-[8%]">Urgency</th>
              <th className="w-[10%]">Assigned To</th>
              <th className="w-[8%]">Deadline</th>
              <th className="w-[11%]">Status</th>
            </tr>
          </thead>
          <tbody>
            {documents.map((doc, i) => (
              <tr key={doc.id}>
                <td className="text-center">{i + 1}</td>
                <td className="font-mono">{doc.dtsReferenceNo}</td>
                <td>{formatDate(doc.dateTimeReceived)}</td>
                <td>{doc.modeOfReceipt}</td>
                <td>{doc.documentType}</td>
                <td>{doc.subjectBriefDescription}</td>
                <td>{doc.urgencyLevel}</td>
                <td>{doc.referredAssignedTo || "—"}</td>
                <td>{formatDate(doc.deadlineDueDate)}</td>
                <td>{doc.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <footer className="mt-6 flex justify-between border-t border-slate-300 pt-3 text-[9px] text-slate-600">
        <span>
          {agency.agency_name} · {agency.agency_subtitle}
        </span>
        <span>{documents.length} records printed</span>
      </footer>
    </div>
  )
}

export type { DtsDocument }
