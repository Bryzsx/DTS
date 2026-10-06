import { useCallback, useEffect, useState } from "react"
import { PageHeader } from "../components/ui/PageHeader"
import { api } from "../lib/api"
import type { AgencySettings, Office } from "../lib/types"

export default function Settings() {
  const [settings, setSettings] = useState<AgencySettings | null>(null)
  const [offices, setOffices] = useState<Office[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [officeForm, setOfficeForm] = useState({ name: "", code: "" })
  const [officeError, setOfficeError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [s, o] = await Promise.all([
        api<{ settings: AgencySettings }>("/api/admin/settings"),
        api<{ offices: Office[] }>("/api/admin/offices?includeInactive=true"),
      ])
      setSettings(s.settings)
      setOffices(o.offices)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load settings")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function saveSettings(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const r = await api<{ settings: AgencySettings }>("/api/admin/settings", {
        method: "PUT",
        body: settings,
      })
      setSettings(r.settings)
      setNotice("Settings saved.")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save settings")
    } finally {
      setSaving(false)
    }
  }

  async function addOffice(e: React.FormEvent) {
    e.preventDefault()
    setOfficeError(null)
    try {
      await api("/api/admin/offices", {
        method: "POST",
        body: { name: officeForm.name, code: officeForm.code || null },
      })
      setOfficeForm({ name: "", code: "" })
      await load()
    } catch (err) {
      setOfficeError(err instanceof Error ? err.message : "Could not add the office")
    }
  }

  async function toggleOffice(office: Office) {
    try {
      await api(`/api/admin/offices/${office.id}`, {
        method: "PATCH",
        body: { active: !office.active },
      })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the office")
    }
  }

  if (loading) return <p className="text-sm text-slate-500">Loading settings…</p>

  return (
    <>
      <PageHeader
        eyebrow="Administration"
        title="Settings"
        subtitle="Agency identity used on printed letterheads, and the office directory offered when routing a document."
      />

      {notice && (
        <p className="alert-success mb-4 flex items-center justify-between gap-4" role="status">
          <span>{notice}</span>
          <button
            onClick={() => setNotice(null)}
            className="text-sm font-semibold underline underline-offset-2"
          >
            Dismiss
          </button>
        </p>
      )}
      {error && <p className="alert-error mb-4">{error}</p>}

      <div className="grid gap-6 lg:grid-cols-2">
        {settings && (
          <form onSubmit={saveSettings} className="card p-5 sm:p-6">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">Agency identity</h2>
            <p className="mt-1 text-xs text-slate-500">
              These values appear on the printed register and record sheet.
            </p>

            <div className="mt-4 space-y-3">
              <div>
                <label htmlFor="s-name" className="label">
                  Agency name
                </label>
                <input
                  id="s-name"
                  className="input"
                  value={settings.agency_name}
                  onChange={(e) => setSettings({ ...settings, agency_name: e.target.value })}
                />
              </div>
              <div>
                <label htmlFor="s-subtitle" className="label">
                  Office / subtitle
                </label>
                <input
                  id="s-subtitle"
                  className="input"
                  value={settings.agency_subtitle}
                  onChange={(e) => setSettings({ ...settings, agency_subtitle: e.target.value })}
                />
              </div>
              <div>
                <label htmlFor="s-register" className="label">
                  Register title
                </label>
                <input
                  id="s-register"
                  className="input"
                  value={settings.register_title}
                  onChange={(e) => setSettings({ ...settings, register_title: e.target.value })}
                />
              </div>
              <div>
                <label htmlFor="s-seal" className="label">
                  Seal image URL
                </label>
                <input
                  id="s-seal"
                  className="input"
                  placeholder="https://… or a path already served by this app"
                  value={settings.agency_seal_url}
                  onChange={(e) => setSettings({ ...settings, agency_seal_url: e.target.value })}
                />
                <p className="hint">Leave empty to print without a seal.</p>
              </div>
            </div>

            <button type="submit" disabled={saving} className="btn-primary mt-5">
              {saving ? "Saving…" : "Save settings"}
            </button>
          </form>
        )}

        <div className="card p-5 sm:p-6">
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">Offices / divisions</h2>
          <p className="mt-1 text-xs text-slate-500">
            Offered as suggestions when routing a document. Field 14 still accepts any free-text
            value.
          </p>

          <form onSubmit={addOffice} className="mt-4 flex flex-wrap items-end gap-2">
            <div className="min-w-[12rem] flex-1">
              <label htmlFor="o-name" className="label">
                Office name
              </label>
              <input
                id="o-name"
                className="input"
                required
                value={officeForm.name}
                onChange={(e) => setOfficeForm({ ...officeForm, name: e.target.value })}
              />
            </div>
            <div className="w-28">
              <label htmlFor="o-code" className="label">
                Code
              </label>
              <input
                id="o-code"
                className="input"
                value={officeForm.code}
                onChange={(e) => setOfficeForm({ ...officeForm, code: e.target.value })}
              />
            </div>
            <button type="submit" className="btn-primary">
              Add
            </button>
          </form>
          {officeError && <p className="field-error mt-2">{officeError}</p>}

          <ul className="mt-4 divide-y divide-slate-100 dark:divide-slate-800">
            {offices.length === 0 ? (
              <li className="py-3 text-sm text-slate-500">No offices defined yet.</li>
            ) : (
              offices.map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="text-sm text-slate-800 dark:text-slate-100">
                    {o.name}
                    {o.code && <span className="ml-2 text-xs text-slate-500">{o.code}</span>}
                  </span>
                  <button
                    onClick={() => toggleOffice(o)}
                    className={o.active ? "badge-received" : "badge-done"}
                  >
                    {o.active ? "Active" : "Inactive"}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      </div>
    </>
  )
}
