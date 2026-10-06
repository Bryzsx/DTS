import { useState, type FormEvent } from "react"
import { Navigate, useLocation } from "react-router-dom"
import { useAuth } from "../lib/useAuth"
import { ApiError } from "../lib/api"

export default function Login() {
  const { login, user } = useAuth()
  const location = useLocation()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const from = (location.state as { from?: string } | null)?.from ?? "/"
  if (user) return <Navigate to={from} replace />

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await login(email.trim(), password)
    } catch (err) {
      // Deliberately generic: the API returns the same message for an unknown
      // email and a wrong password, and so does this form.
      setError(err instanceof ApiError ? err.message : "Unable to sign in. Please try again.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-navy-900 lg:flex-row">
      <div className="flex flex-col justify-center bg-white px-6 py-12 lg:w-[46%] lg:px-16">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3">
            <img src="/seal.svg" alt="" className="h-12 w-12" aria-hidden="true" />
            <div className="leading-tight">
              <h1 className="text-lg font-extrabold tracking-tight text-navy-900">
                Document Tracking System
              </h1>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Records Management Office
              </p>
            </div>
          </div>

          <h2 className="mb-1 text-2xl font-bold text-navy-900">Sign in</h2>
          <p className="mb-6 text-sm text-slate-500">
            Access is restricted to authorised personnel. Accounts are issued by an administrator.
          </p>

          <form onSubmit={onSubmit} noValidate>
            <div className="mb-4">
              <label htmlFor="email" className="label">
                Email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="username"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input"
              />
            </div>

            <div className="mb-2">
              <label htmlFor="password" className="label">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input"
              />
            </div>

            {error && (
              <p role="alert" className="alert-error mt-4">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="btn-primary mt-6 w-full justify-center"
            >
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>
      </div>

      <div className="relative hidden flex-1 items-center justify-center overflow-hidden lg:flex">
        <div className="absolute inset-0 bg-gradient-to-br from-navy-800 via-navy-900 to-navy-950" />
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "linear-gradient(to right, #fff 1px, transparent 1px), linear-gradient(to bottom, #fff 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
          aria-hidden="true"
        />
        <div className="relative max-w-md px-12 text-center">
          <div className="mx-auto mb-8 h-px w-16 bg-gold-500" />
          <blockquote className="text-lg font-medium leading-relaxed text-slate-200">
            Every document received is recorded, referenced, tracked to completion, and filed — on a
            single authoritative register.
          </blockquote>
          <p className="mt-6 text-xs font-semibold uppercase tracking-[0.2em] text-gold-300/80">
            Records Management Office
          </p>
        </div>
      </div>
    </div>
  )
}
