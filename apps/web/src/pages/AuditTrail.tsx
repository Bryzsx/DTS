import { useCallback, useEffect, useMemo, useState } from "react"
import { PageHeader } from "../components/ui/PageHeader"
import { EmptyState } from "../components/ui/EmptyState"
import { api } from "../lib/api"
import { formatDateTime } from "../lib/format"
import type { AuditEntry } from "../lib/types"

const PAGE_SIZE = 100

export default function AuditTrail() {
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState("")
  const [actor, setActor] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const r = await api<{ audit: AuditEntry[] }>(`/api/admin/audit?limit=500`)
      setEntries(r.audit)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the audit trail")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const actions = useMemo(() => Array.from(new Set(entries.map((e) => e.action))).sort(), [entries])
  const actors = useMemo(
    () => Array.from(new Set(entries.map((e) => e.userName ?? "System"))).sort(),
    [entries],
  )

  const visible = useMemo(
    () =>
      entries.filter((e) => {
        if (actor && (e.userName ?? "System") !== actor) return false
        if (!filter) return true
        const needle = filter.toLowerCase()
        return (
          e.action.toLowerCase().includes(needle) ||
          (e.detail ? JSON.stringify(e.detail).toLowerCase().includes(needle) : false)
        )
      }),
    [entries, filter, actor],
  )

  return (
    <>
      <PageHeader
        eyebrow="Administration"
        title="Audit trail"
        subtitle={`${visible.length} of ${entries.length} most recent entries.`}
        actions={
          <button onClick={load} className="btn-secondary btn-sm">
            Refresh
          </button>
        }
      />

      {error && (
        <p className="alert-error mb-4 flex items-center justify-between gap-4" role="alert">
          <span>{error}</span>
          <button onClick={load} className="text-sm font-semibold underline underline-offset-2">
            Retry
          </button>
        </p>
      )}

      <div className="card mb-4 grid gap-3 p-4 sm:grid-cols-3">
        <div className="sm:col-span-1">
          <label htmlFor="a-filter" className="label">
            Search
          </label>
          <input
            id="a-filter"
            className="input"
            placeholder="Action or detail…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="a-action" className="label">
            Action
          </label>
          <select
            id="a-action"
            className="input"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="">All actions</option>
            {actions.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="a-actor" className="label">
            Performed by
          </label>
          <select
            id="a-actor"
            className="input"
            value={actor}
            onChange={(e) => setActor(e.target.value)}
          >
            <option value="">Anyone</option>
            {actors.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="card overflow-hidden">
        {loading && entries.length === 0 ? (
          <div className="space-y-2 p-5">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="skeleton h-10 w-full" />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <EmptyState
            title="No matching entries"
            description="Adjust the filters, or perform an action to create one."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <caption className="sr-only">System audit trail</caption>
              <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/60">
                <tr>
                  <th scope="col" className="table-header w-[11rem]">
                    When
                  </th>
                  <th scope="col" className="table-header w-[9rem]">
                    Who
                  </th>
                  <th scope="col" className="table-header w-[13rem]">
                    Action
                  </th>
                  <th scope="col" className="table-header w-[10rem]">
                    Record
                  </th>
                  <th scope="col" className="table-header">
                    Detail
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {visible.slice(0, PAGE_SIZE).map((e) => (
                  <tr key={e.id}>
                    <td className="table-cell whitespace-nowrap text-xs">
                      {formatDateTime(e.createdAt)}
                    </td>
                    <td className="table-cell text-xs">{e.userName ?? "System"}</td>
                    <td className="table-cell text-xs font-medium">{e.action}</td>
                    <td className="table-cell text-xs text-slate-500">
                      {e.entity ? `${e.entity}${e.entityId ? ` #${e.entityId}` : ""}` : "—"}
                    </td>
                    <td className="table-cell">
                      <code className="block max-w-md truncate text-[11px] text-slate-600 dark:text-slate-300">
                        {e.detail ? JSON.stringify(e.detail) : "—"}
                      </code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}
