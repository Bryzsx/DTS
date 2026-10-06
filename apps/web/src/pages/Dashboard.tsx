import { useCallback, useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { PageHeader } from "../components/ui/PageHeader"
import { StatCard } from "../components/ui/StatCard"
import { EmptyState } from "../components/ui/EmptyState"
import { api } from "../lib/api"
import { useAuth } from "../lib/useAuth"
import { can } from "../lib/permissions"
import { formatDate, statusBadgeClass, urgencyBadgeClass } from "../lib/format"
import type { DashboardStats, DocumentStatus, UrgencyLevel } from "../lib/types"

export default function Dashboard() {
  const { user } = useAuth()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setStats(await api<DashboardStats>("/api/reports/stats"))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load dashboard")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const firstName = user?.name.split(" ")[0] ?? ""

  return (
    <>
      <PageHeader
        eyebrow="Dashboard"
        title={`Good day, ${firstName}`}
        subtitle="Current state of the document register."
        actions={
          can(user?.role ?? "viewer", "createDocument") ? (
            <Link to="/documents/new" className="btn-primary">
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Intake document
            </Link>
          ) : null
        }
      />

      {error && (
        <div className="alert-error mb-6 flex items-center justify-between gap-4" role="alert">
          <span>{error}</span>
          <button
            onClick={load}
            className="shrink-0 text-sm font-semibold underline underline-offset-2"
          >
            Retry
          </button>
        </div>
      )}

      {loading && !stats ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="card p-5">
              <div className="skeleton h-3 w-24" />
              <div className="skeleton mt-4 h-8 w-16" />
            </div>
          ))}
        </div>
      ) : stats ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Documents on register" value={stats.total} to="/register" />
            <StatCard label="Open" value={stats.open} to="/register?status=open" />
            <StatCard
              label="Past due"
              value={stats.overdue}
              to="/register?overdue=true"
              tone={stats.overdue > 0 ? "danger" : "neutral"}
            />
            <StatCard label="Due within 7 days" value={stats.dueThisWeek} to="/register" />
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            <section className="card lg:col-span-2" aria-labelledby="overdue-heading">
              <header className="flex items-center justify-between gap-4 border-b border-slate-200 px-5 py-4 dark:border-slate-700">
                <h2
                  id="overdue-heading"
                  className="text-sm font-bold text-slate-900 dark:text-white"
                >
                  Past due
                </h2>
                <Link
                  to="/register"
                  className="text-xs font-semibold text-navy-600 hover:underline dark:text-navy-300"
                >
                  View register
                </Link>
              </header>
              {stats.overdueList.length === 0 ? (
                <EmptyState
                  title="Nothing past due"
                  description="Every open record is within its deadline."
                />
              ) : (
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {stats.overdueList.slice(0, 8).map((doc) => (
                    <li key={doc.id}>
                      <Link
                        to={`/documents/${doc.id}`}
                        className="flex items-start justify-between gap-4 px-5 py-3.5 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                            {doc.subjectBriefDescription}
                          </p>
                          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                            <span className="font-mono">{doc.dtsReferenceNo}</span>
                            {doc.referredAssignedTo && <> · {doc.referredAssignedTo}</>}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <span className={statusBadgeClass(doc.status as DocumentStatus)}>
                            {doc.status}
                          </span>
                          <p className="mt-1 text-xs font-semibold text-red-600 dark:text-red-400">
                            Due {formatDate(doc.deadlineDueDate)}
                          </p>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="card" aria-labelledby="by-status-heading">
              <header className="border-b border-slate-200 px-5 py-4 dark:border-slate-700">
                <h2
                  id="by-status-heading"
                  className="text-sm font-bold text-slate-900 dark:text-white"
                >
                  By status
                </h2>
              </header>
              <div className="space-y-2.5 px-5 py-4">
                {stats.byStatus.map((row) => {
                  const pct = stats.total === 0 ? 0 : Math.round((row.count / stats.total) * 100)
                  return (
                    <div key={row.status}>
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span className="font-medium text-slate-600 dark:text-slate-300">
                          {row.status}
                        </span>
                        <span className="font-semibold tabular-nums text-slate-900 dark:text-white">
                          {row.count}
                        </span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                        <div
                          className="h-full rounded-full bg-navy-600 dark:bg-navy-400"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <section className="card" aria-labelledby="due-week-heading">
              <header className="border-b border-slate-200 px-5 py-4 dark:border-slate-700">
                <h2
                  id="due-week-heading"
                  className="text-sm font-bold text-slate-900 dark:text-white"
                >
                  Due within 7 days
                </h2>
              </header>
              {stats.upcomingList.length === 0 ? (
                <EmptyState
                  title="No upcoming deadlines"
                  description="Nothing falls due in the next week."
                />
              ) : (
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {stats.upcomingList.slice(0, 8).map((doc) => (
                    <li key={doc.id}>
                      <Link
                        to={`/documents/${doc.id}`}
                        className="flex items-center justify-between gap-4 px-5 py-3 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm text-slate-800 dark:text-slate-100">
                            {doc.subjectBriefDescription}
                          </p>
                          <p className="font-mono text-xs text-slate-500">{doc.dtsReferenceNo}</p>
                        </div>
                        <span className="shrink-0 text-xs font-semibold text-slate-600 dark:text-slate-300">
                          {formatDate(doc.deadlineDueDate)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="card" aria-labelledby="urgency-heading">
              <header className="border-b border-slate-200 px-5 py-4 dark:border-slate-700">
                <h2
                  id="urgency-heading"
                  className="text-sm font-bold text-slate-900 dark:text-white"
                >
                  By urgency
                </h2>
              </header>
              <div className="grid grid-cols-3 gap-4 px-5 py-5">
                {stats.byUrgency.map((row) => (
                  <div key={row.urgencyLevel} className="text-center">
                    <p className="text-3xl font-extrabold tabular-nums text-slate-900 dark:text-white">
                      {row.count}
                    </p>
                    <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      {row.urgencyLevel}
                    </p>
                    <div className="mt-2 flex justify-center">
                      <span className={urgencyBadgeClass(row.urgencyLevel as UrgencyLevel)}>
                        {row.urgencyLevel}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </>
      ) : null}
    </>
  )
}
