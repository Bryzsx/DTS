import type { ReactNode } from "react"

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
  className = "mb-6",
}: {
  eyebrow?: string
  title: string
  /** Plain text or inline markup — the record detail page passes a formatted reference. */
  subtitle?: ReactNode
  actions?: ReactNode
  className?: string
}) {
  return (
    <div className={`flex flex-wrap items-end justify-between gap-4 ${className}`}>
      <div className="animate-fade-in-up">
        {eyebrow && <p className="page-eyebrow mb-1">{eyebrow}</p>}
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2 animate-fade-in-up">{actions}</div>
      )}
    </div>
  )
}
