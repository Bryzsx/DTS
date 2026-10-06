import { Link } from "react-router-dom"
import type { ReactNode } from "react"

export function StatCard({
  label,
  value,
  icon,
  to,
  tone = "neutral",
}: {
  label: string
  value: number | string
  icon?: ReactNode
  /** When present the whole card becomes a link. */
  to?: string
  tone?: "neutral" | "accent" | "danger"
}) {
  const toneClass =
    tone === "danger"
      ? "text-red-600 dark:text-red-400"
      : tone === "accent"
        ? "text-navy-700 dark:text-navy-200"
        : "text-slate-900 dark:text-white"

  const inner = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
          {label}
        </p>
        {icon && <span className="shrink-0 text-slate-300 dark:text-slate-600">{icon}</span>}
      </div>
      <p className={`mt-3 text-3xl font-extrabold tabular-nums ${toneClass}`}>{value}</p>
    </>
  )

  if (to) {
    return (
      <Link
        to={to}
        className="card p-5 transition-shadow hover:shadow-elevated focus-visible:ring-2 focus-visible:ring-navy-500"
      >
        {inner}
      </Link>
    )
  }
  return <div className="card p-5">{inner}</div>
}
