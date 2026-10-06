import { useCallback, useMemo, useState } from "react"
import { api } from "../lib/api"
import type { DtsDocument, DocumentListResponse, DocumentStatus } from "../lib/types"

export interface RegisterFilters {
  q: string
  status: DocumentStatus | ""
  urgency: string
  documentType: string
  office: string
  from: string
  to: string
  overdueOnly: boolean
  includeArchived: boolean
}

export const EMPTY_FILTERS: RegisterFilters = {
  q: "",
  status: "",
  urgency: "",
  documentType: "",
  office: "",
  from: "",
  to: "",
  overdueOnly: false,
  includeArchived: false,
}

/** Mirrors the server's SORT_COLUMNS. */
const SORT_OPTIONS = [
  "received_desc",
  "received_asc",
  "deadline_asc",
  "reference_asc",
  "status_asc",
  "urgency_asc",
] as const
export type SortOption = (typeof SORT_OPTIONS)[number]

/**
 * Builds the shared query string used by both the register table and the CSV /
 * Excel export, so a download always matches what is on screen.
 */
export function buildQuery(
  filters: RegisterFilters,
  opts: { page: number; limit: number; sort: SortOption },
): string {
  const p = new URLSearchParams({
    page: String(opts.page),
    limit: String(opts.limit),
    sort: opts.sort,
  })
  if (filters.q) p.set("q", filters.q)
  if (filters.status) p.set("status", filters.status)
  if (filters.urgency) p.set("urgencyLevel", filters.urgency)
  if (filters.documentType) p.set("documentType", filters.documentType)
  if (filters.office) p.set("assignedTo", filters.office)
  if (filters.from) p.set("dateFrom", filters.from)
  if (filters.to) p.set("dateTo", filters.to)
  if (filters.overdueOnly) p.set("overdue", "true")
  if (filters.includeArchived) p.set("includeArchived", "true")
  return p.toString()
}

/**
 * Register table state — filters, sorting and pagination in one hook, so the
 * list view and the export links cannot drift apart.
 */
export function useRegisterQuery() {
  const [filters, setFilters] = useState<RegisterFilters>(EMPTY_FILTERS)
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(25)
  const [sort, setSort] = useState<SortOption>("received_desc")
  const [data, setData] = useState<{ documents: DtsDocument[]; total: number; pageCount: number }>({
    documents: [],
    total: 0,
    pageCount: 1,
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const queryString = useMemo(
    () => buildQuery(filters, { page, limit, sort }),
    [filters, page, limit, sort],
  )

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setData(await api(`/api/documents?${queryString}`))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the register")
    } finally {
      setLoading(false)
    }
  }, [queryString])

  const patch = useCallback((next: Partial<RegisterFilters>) => {
    setFilters((prev) => ({ ...prev, ...next }))
    setPage(1)
  }, [])

  const reset = useCallback(() => {
    setFilters(EMPTY_FILTERS)
    setPage(1)
  }, [])

  const hasFilters = Object.entries(filters).some(([, v]) => v !== "" && v !== false)

  /** Exports the whole filtered set, not just the visible page. */
  const exportQuery = useMemo(
    () => buildQuery(filters, { page: 1, limit: 200, sort }),
    [filters, sort],
  )

  return {
    filters,
    patch,
    reset,
    hasFilters,
    page,
    setPage,
    limit,
    setLimit,
    sort,
    setSort,
    data,
    loading,
    error,
    refresh,
    pageCount: Math.max(1, data.pageCount),
    queryString,
    exportQuery,
  }
}

export type { DocumentListResponse }
