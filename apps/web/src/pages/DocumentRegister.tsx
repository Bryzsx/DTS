import { useCallback, useEffect, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { PageHeader } from "../components/ui/PageHeader"
import { EmptyState } from "../components/ui/EmptyState"
import { downloadFile } from "../lib/api"
import { useAuth } from "../lib/useAuth"
import { can } from "../lib/permissions"
import { EMPTY_FILTERS, useRegisterQuery, type SortOption } from "../hooks/useRegisterQuery"
import { formatDate, isOverdue, statusBadgeClass, urgencyBadgeClass } from "../lib/format"
import {
  DOCUMENT_TYPES,
  MODES_OF_RECEIPT,
  STATUSES,
  URGENCY_LEVELS,
  type DtsDocument,
} from "../lib/types"

interface ColumnDef {
  key:
    | "reference"
    | "received"
    | "subject"
    | "mode"
    | "type"
    | "urgency"
    | "assigned"
    | "deadline"
    | "status"
  label: string
  sort: SortOption | null
  className: string
}

const COLUMNS: ColumnDef[] = [
  { key: "reference", label: "DTS Ref.", sort: "reference_asc", className: "w-[8.5rem]" },
  { key: "received", label: "Received", sort: "received_desc", className: "w-[9rem]" },
  { key: "subject", label: "Subject / Brief Description", sort: null, className: "" },
  { key: "mode", label: "Mode", sort: null, className: "w-[7rem]" },
  { key: "type", label: "Type", sort: null, className: "w-[7.5rem]" },
  { key: "urgency", label: "Urgency", sort: "urgency_asc", className: "w-[7rem]" },
  { key: "assigned", label: "Assigned To", sort: null, className: "w-[9rem]" },
  { key: "deadline", label: "Deadline", sort: "deadline_asc", className: "w-[7.5rem]" },
  { key: "status", label: "Status", sort: "status_asc", className: "w-[8.5rem]" },
]

export default function DocumentRegister() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const q = useRegisterQuery()

  useEffect(() => {
    q.refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.queryString])

  const onExport = useCallback(
    async (kind: "csv" | "xlsx") => {
      try {
        await downloadFile(`/api/export/documents.${kind}?${q.exportQuery}`, `dts-records.${kind}`)
      } catch (err) {
        window.alert(err instanceof Error ? err.message : "Export failed")
      }
    },
    [q.exportQuery],
  )

  return (
    <>
      <PageHeader
        eyebrow="Records"
        title="Document Register"
        subtitle={
          q.loading && q.data.total === 0
            ? "Loading the register…"
            : `${q.data.total} ${q.data.total === 1 ? "record" : "records"} matching the current filters.`
        }
        actions={
          <>
            <button
              onClick={() => onExport("csv")}
              className="btn-secondary btn-sm"
              disabled={q.data.total === 0}
              title="Download the filtered register as CSV"
            >
              Export CSV
            </button>
            <button
              onClick={() => onExport("xlsx")}
              className="btn-secondary btn-sm"
              disabled={q.data.total === 0}
              title="Download the filtered register as an Excel workbook"
            >
              Export Excel
            </button>
            <Link
              to="/print/register"
              target="_blank"
              rel="noreferrer"
              className="btn-secondary btn-sm"
            >
              Print register
            </Link>
            {can(user?.role ?? "viewer", "createDocument") && (
              <Link to="/documents/new" className="btn-primary btn-sm">
                Intake
              </Link>
            )}
          </>
        }
      />

      <div className="card mb-4 p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
          <div className="xl:col-span-2">
            <label htmlFor="f-q" className="label">
              Search
            </label>
            <input
              id="f-q"
              className="input"
              placeholder="Reference, subject or sender…"
              value={q.filters.q}
              onChange={(e) => q.patch({ q: e.target.value })}
            />
          </div>
          <div>
            <label htmlFor="f-status" className="label">
              Status
            </label>
            <select
              id="f-status"
              className="input"
              value={q.filters.status}
              onChange={(e) => q.patch({ status: e.target.value as typeof q.filters.status })}
            >
              <option value="">All statuses</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="f-urgency" className="label">
              Urgency
            </label>
            <select
              id="f-urgency"
              className="input"
              value={q.filters.urgency}
              onChange={(e) => q.patch({ urgency: e.target.value })}
            >
              <option value="">Any urgency</option>
              {URGENCY_LEVELS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="f-type" className="label">
              Document type
            </label>
            <select
              id="f-type"
              className="input"
              value={q.filters.documentType}
              onChange={(e) => q.patch({ documentType: e.target.value })}
            >
              <option value="">Any type</option>
              {DOCUMENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="f-mode" className="label">
              Mode of receipt
            </label>
            <select
              id="f-mode"
              className="input"
              value=""
              onChange={(e) => e.target.value}
              disabled
              title="Available in the print register and export"
            >
              <option value="">Any mode</option>
              {MODES_OF_RECEIPT.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="f-office" className="label">
              Assigned to
            </label>
            <input
              id="f-office"
              className="input"
              placeholder="Office name…"
              value={q.filters.office}
              onChange={(e) => q.patch({ office: e.target.value })}
            />
          </div>
          <div>
            <label htmlFor="f-from" className="label">
              Received from
            </label>
            <input
              id="f-from"
              type="date"
              className="input"
              value={q.filters.from}
              onChange={(e) => q.patch({ from: e.target.value })}
            />
          </div>
          <div>
            <label htmlFor="f-to" className="label">
              Received to
            </label>
            <input
              id="f-to"
              type="date"
              className="input"
              value={q.filters.to}
              onChange={(e) => q.patch({ to: e.target.value })}
            />
          </div>
          <div>
            <label htmlFor="f-sort" className="label">
              Sort by
            </label>
            <select
              id="f-sort"
              className="input"
              value={q.sort}
              onChange={(e) => q.setSort(e.target.value as SortOption)}
            >
              <option value="received_desc">Newest received</option>
              <option value="received_asc">Oldest received</option>
              <option value="deadline_asc">Deadline, soonest</option>
              <option value="reference_asc">DTS reference</option>
              <option value="status_asc">Status</option>
              <option value="urgency_asc">Urgency</option>
            </select>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3 dark:border-slate-800">
          <div className="flex flex-wrap items-center gap-5">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300 text-navy-700 focus:ring-navy-500"
                checked={q.filters.overdueOnly}
                onChange={(e) => q.patch({ overdueOnly: e.target.checked })}
              />
              Past due only
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300 text-navy-700 focus:ring-navy-500"
                checked={q.filters.includeArchived}
                onChange={(e) => q.patch({ includeArchived: e.target.checked })}
              />
              Include archived
            </label>
          </div>
          <button onClick={q.reset} className="btn-ghost btn-sm" disabled={!q.hasFilters}>
            Clear filters
          </button>
        </div>
      </div>

      <div className="card overflow-hidden">
        {q.error && (
          <div className="alert-error m-4 flex items-center justify-between gap-4" role="alert">
            <span>{q.error}</span>
            <button
              onClick={q.refresh}
              className="shrink-0 text-sm font-semibold underline underline-offset-2"
            >
              Retry
            </button>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full">
            <caption className="sr-only">Documents on the register</caption>
            <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/60">
              <tr>
                {COLUMNS.map((col) => (
                  <th key={col.key} scope="col" className={`table-header ${col.className ?? ""}`}>
                    {col.sort ? (
                      <button
                        onClick={() => q.setSort(col.sort!)}
                        className={`table-sort ${q.sort === col.sort ? "text-navy-700 dark:text-navy-200" : ""}`}
                      >
                        {col.label}
                        <span aria-hidden="true" className="text-[9px]">
                          {q.sort === col.sort ? "▼" : "↕"}
                        </span>
                      </button>
                    ) : (
                      col.label
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {q.loading && q.data.documents.length === 0 ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    {COLUMNS.map((c) => (
                      <td key={c.key} className="table-cell">
                        <div className="skeleton h-4 w-full" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : q.data.documents.length === 0 ? (
                <tr>
                  <td colSpan={COLUMNS.length} className="p-0">
                    <EmptyState
                      title="No records match"
                      description="Adjust the filters, or intake a new document to start the register."
                      action={
                        can(user?.role ?? "viewer", "createDocument") ? (
                          <Link to="/documents/new" className="btn-primary btn-sm">
                            Intake document
                          </Link>
                        ) : null
                      }
                    />
                  </td>
                </tr>
              ) : (
                q.data.documents.map((doc) => (
                  <RegisterRow
                    key={doc.id}
                    doc={doc}
                    onOpen={() => navigate(`/documents/${doc.id}`)}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>

        <nav
          className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 dark:border-slate-700"
          aria-label="Register pagination"
        >
          <div className="flex items-center gap-3 text-sm text-slate-600 dark:text-slate-300">
            <label
              htmlFor="page-size"
              className="text-[11px] font-semibold uppercase tracking-wide text-slate-500"
            >
              Rows
            </label>
            <select
              id="page-size"
              className="input w-auto py-1 text-sm"
              value={q.limit}
              onChange={(e) => {
                q.setLimit(Number(e.target.value))
                q.setPage(1)
              }}
            >
              {[25, 50, 100, 200].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <span className="whitespace-nowrap">
              Page {q.page} of {q.pageCount}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => q.setPage(1)}
              disabled={q.page === 1}
              className="btn-secondary btn-sm"
            >
              First
            </button>
            <button
              onClick={() => q.setPage((p) => Math.max(1, p - 1))}
              disabled={q.page === 1}
              className="btn-secondary btn-sm"
            >
              Previous
            </button>
            <button
              onClick={() => q.setPage((p) => Math.min(q.pageCount, p + 1))}
              disabled={q.page >= q.pageCount}
              className="btn-secondary btn-sm"
            >
              Next
            </button>
            <button
              onClick={() => q.setPage(q.pageCount)}
              disabled={q.page >= q.pageCount}
              className="btn-secondary btn-sm"
            >
              Last
            </button>
          </div>
        </nav>
      </div>
    </>
  )
}

function RegisterRow({ doc, onOpen }: { doc: DtsDocument; onOpen: () => void }) {
  const overdue = isOverdue(doc.deadlineDueDate, doc.status)
  return (
    <tr
      className="cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60"
      onClick={onOpen}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onOpen()
        }
      }}
    >
      <td className="table-cell font-mono text-xs font-semibold text-navy-700 dark:text-navy-300">
        {doc.dtsReferenceNo}
      </td>
      <td className="table-cell whitespace-nowrap text-xs">
        <span className="block">{formatDate(doc.dateTimeReceived)}</span>
        <span className="text-slate-400">
          {new Date(doc.dateTimeReceived).toLocaleTimeString(undefined, {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      </td>
      <td className="table-cell">
        <p className="line-clamp-2 max-w-md font-medium text-slate-900 dark:text-white">
          {doc.subjectBriefDescription}
        </p>
        {doc.referenceNo && <p className="mt-0.5 text-xs text-slate-500">Ref: {doc.referenceNo}</p>}
      </td>
      <td className="table-cell text-xs text-slate-600 dark:text-slate-300">{doc.modeOfReceipt}</td>
      <td className="table-cell text-xs text-slate-600 dark:text-slate-300">{doc.documentType}</td>
      <td className="table-cell">
        <span className={urgencyBadgeClass(doc.urgencyLevel)}>{doc.urgencyLevel}</span>
      </td>
      <td className="table-cell text-xs text-slate-600 dark:text-slate-300">
        <span className="line-clamp-2">{doc.referredAssignedTo || "—"}</span>
      </td>
      <td className="table-cell whitespace-nowrap">
        <span
          className={overdue ? "text-xs font-semibold text-red-600 dark:text-red-400" : "text-xs"}
        >
          {formatDate(doc.deadlineDueDate)}
        </span>
      </td>
      <td className="table-cell">
        <span className={statusBadgeClass(doc.status)}>{doc.status}</span>
      </td>
    </tr>
  )
}

export { EMPTY_FILTERS }
