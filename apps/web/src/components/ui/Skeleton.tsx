export function Skeleton({
  className = "",
  shimmer = false,
}: {
  className?: string
  shimmer?: boolean
}) {
  if (shimmer) {
    return (
      <div aria-hidden className={`relative overflow-hidden rounded-lg bg-slate-100 ${className}`}>
        <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/60 to-transparent" />
      </div>
    )
  }
  return <div aria-hidden className={`animate-pulse rounded-lg bg-slate-200/70 ${className}`} />
}
