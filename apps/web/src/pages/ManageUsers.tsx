import { useCallback, useEffect, useState } from "react"
import { PageHeader } from "../components/ui/PageHeader"
import { EmptyState } from "../components/ui/EmptyState"
import { api } from "../lib/api"
import { ROLE_OPTIONS } from "../components/AppShell"
import type { Role } from "../lib/types"

interface UserRow {
  id: number
  name: string
  email: string
  role: Role
  status: "active" | "disabled"
  lastLoginAt: string | null
  createdAt: string
}

const ROLE_DESCRIPTION: Record<Role, string> = {
  admin: "Full access, including accounts, settings and archiving.",
  officer: "Intake, routing, close-out and attachments.",
  rd: "Everything an officer can do, plus the RD disposition block.",
  viewer: "Read-only access to the register.",
}

export default function ManageUsers() {
  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const [form, setForm] = useState({ name: "", email: "", role: "viewer" as Role, password: "" })
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const r = await api<{ users: UserRow[] }>("/api/admin/users")
      setUsers(r.users)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load accounts")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function createUser(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    setSaving(true)
    try {
      await api("/api/admin/users", { method: "POST", body: form })
      setForm({ name: "", email: "", role: "viewer", password: "" })
      setNotice("Account created.")
      await load()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not create the account")
    } finally {
      setSaving(false)
    }
  }

  async function patchUser(id: number, body: Partial<Pick<UserRow, "role" | "status">>) {
    setError(null)
    try {
      await api(`/api/admin/users/${id}`, { method: "PATCH", body })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the account")
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Administration"
        title="User accounts"
        subtitle="Accounts are created here. There is no self-service sign-up."
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
      {error && (
        <p className="alert-error mb-4 flex items-center justify-between gap-4" role="alert">
          <span>{error}</span>
          <button onClick={load} className="text-sm font-semibold underline underline-offset-2">
            Retry
          </button>
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <caption className="sr-only">User accounts</caption>
              <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/60">
                <tr>
                  <th scope="col" className="table-header">
                    Name
                  </th>
                  <th scope="col" className="table-header">
                    Email
                  </th>
                  <th scope="col" className="table-header w-[9rem]">
                    Role
                  </th>
                  <th scope="col" className="table-header w-[8rem]">
                    Status
                  </th>
                  <th scope="col" className="table-header w-[8rem]">
                    Last sign-in
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 5 }).map((__, j) => (
                        <td key={j} className="table-cell">
                          <div className="skeleton h-4 w-full" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : users.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-0">
                      <EmptyState
                        title="No accounts yet"
                        description="Create the first account with the form alongside."
                      />
                    </td>
                  </tr>
                ) : (
                  users.map((u) => (
                    <tr key={u.id}>
                      <td className="table-cell font-medium">{u.name}</td>
                      <td className="table-cell text-xs text-slate-600 dark:text-slate-300">
                        {u.email}
                      </td>
                      <td className="table-cell">
                        <select
                          className="input py-1 text-xs"
                          value={u.role}
                          aria-label={`Role for ${u.name}`}
                          onChange={(e) => patchUser(u.id, { role: e.target.value as Role })}
                        >
                          {ROLE_OPTIONS.map((r) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="table-cell">
                        <button
                          onClick={() =>
                            patchUser(u.id, {
                              status: u.status === "active" ? "disabled" : "active",
                            })
                          }
                          className={u.status === "active" ? "badge-received" : "badge-done"}
                        >
                          {u.status === "active" ? "Active" : "Disabled"}
                        </button>
                      </td>
                      <td className="table-cell text-xs text-slate-500">
                        {u.lastLoginAt
                          ? new Date(u.lastLoginAt).toLocaleDateString(undefined, {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                            })
                          : "Never"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <form onSubmit={createUser} className="card h-fit p-5">
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">New account</h2>
          <p className="mt-1 text-xs text-slate-500">
            Share the password through a channel other than this system, and ask the user to change
            it after signing in.
          </p>

          <div className="mt-4 space-y-3">
            <div>
              <label htmlFor="u-name" className="label">
                Full name
              </label>
              <input
                id="u-name"
                className="input"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div>
              <label htmlFor="u-email" className="label">
                Email address
              </label>
              <input
                id="u-email"
                type="email"
                className="input"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div>
              <label htmlFor="u-role" className="label">
                Role
              </label>
              <select
                id="u-role"
                className="input"
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
              >
                {ROLE_OPTIONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              <p className="hint">{ROLE_DESCRIPTION[form.role]}</p>
            </div>
            <div>
              <label htmlFor="u-password" className="label">
                Temporary password
              </label>
              <input
                id="u-password"
                type="text"
                className="input font-mono text-xs"
                required
                minLength={10}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                aria-describedby="u-password-hint"
              />
              <p id="u-password-hint" className="hint">
                At least 10 characters, including a letter and a number.
              </p>
            </div>
          </div>

          {formError && <p className="alert-error mt-3">{formError}</p>}

          <button
            type="submit"
            disabled={saving}
            className="btn-primary mt-4 w-full justify-center"
          >
            {saving ? "Creating…" : "Create account"}
          </button>
        </form>
      </div>
    </>
  )
}
