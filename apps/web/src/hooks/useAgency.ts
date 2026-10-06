import { useEffect, useState } from "react"
import { api } from "../lib/api"
import type { AgencySettings, DtsDocument } from "../lib/types"

export const FALLBACK_SETTINGS: AgencySettings = {
  agency_name: "Document Tracking System",
  agency_subtitle: "Records Management Office",
  agency_seal_url: "",
  register_title: "Document Tracking Register",
}

/**
 * Fetches the admin-editable agency identity (name, subtitle, seal, register
 * title). Printed letterheads read from here rather than hard-coding text, so
 * renaming the agency never leaves stale wording on paper.
 */
export function useAgency(): AgencySettings {
  const [settings, setSettings] = useState<AgencySettings>(FALLBACK_SETTINGS)

  useEffect(() => {
    let cancelled = false
    api<{ settings: AgencySettings }>("/api/admin/settings")
      .then((r) => {
        if (!cancelled) setSettings({ ...FALLBACK_SETTINGS, ...r.settings })
      })
      .catch(() => {
        /* defaults stand if settings cannot be read */
      })
    return () => {
      cancelled = true
    }
  }, [])

  return settings
}

/** Data for the printable register, bounded by an optional date range. */
export function useRegisterData(from: string, to: string) {
  const [documents, setDocuments] = useState<DtsDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const p = new URLSearchParams({ limit: "2000", sort: "received_desc" })
    if (from) p.set("dateFrom", from)
    if (to) p.set("dateTo", to)

    let cancelled = false
    api<{ documents: DtsDocument[] }>(`/api/documents?${p}`)
      .then((r) => {
        if (!cancelled) setDocuments(r.documents)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load the register")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [from, to])

  return { documents, loading, error }
}
