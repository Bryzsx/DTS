import { useEffect, useMemo, useState } from "react"

const DEFAULT_PAGE_SIZE = 20

export function useTableControls<T>(items: T[], searchKeys: (item: T) => string[]) {
  const [search, setSearch] = useState("")
  const [pageSize, setPageSize] = useState<number | "All">(DEFAULT_PAGE_SIZE)
  const [page, setPage] = useState(1)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return items
    return items.filter((item) => searchKeys(item).some((key) => key.toLowerCase().includes(q)))
  }, [items, search, searchKeys])

  useEffect(() => {
    setPage(1)
  }, [search, pageSize])

  const total = filtered.length
  const visible = pageSize === "All" ? filtered : filtered.slice(0, pageSize)

  return { search, setSearch, pageSize, setPageSize, page, setPage, filtered, visible, total }
}
