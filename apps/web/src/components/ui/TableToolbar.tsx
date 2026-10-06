export function TableToolbar({
  search,
  onSearch,
  placeholder = "Search…",
  total,
  pageSize,
  onPageSize,
}: {
  search: string
  onSearch: (value: string) => void
  placeholder?: string
  total: number
  pageSize?: number | "All"
  onPageSize?: (value: number | "All") => void
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
      <div className="relative flex-1 sm:max-w-xs">
        <svg
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden
        >
          <circle cx="11" cy="11" r="7" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35" />
        </svg>
        <input
          type="search"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder={placeholder}
          className="input w-full pl-9"
          aria-label={placeholder}
        />
      </div>
      <div className="flex items-center justify-between sm:justify-end gap-3">
        <span className="text-xs text-slate-400">
          {total} {total === 1 ? "result" : "results"}
        </span>
        {pageSize !== undefined && onPageSize !== undefined && (
          <label className="flex items-center gap-2 text-xs text-slate-500">
            Show
            <select
              value={pageSize}
              onChange={(e) =>
                onPageSize(e.target.value === "All" ? "All" : Number(e.target.value))
              }
              className="input !w-auto !py-1.5 !text-xs"
              aria-label="Rows per page"
            >
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value="All">All</option>
            </select>
          </label>
        )}
      </div>
    </div>
  )
}
