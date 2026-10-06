import { Link } from "react-router-dom"

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <p className="font-mono text-5xl font-extrabold tracking-tight text-navy-900 dark:text-navy-200">
        404
      </p>
      <h1 className="mt-3 text-lg font-bold text-slate-900 dark:text-white">Page not found</h1>
      <p className="mt-1 max-w-sm text-sm text-slate-500 dark:text-slate-400">
        That address does not match any part of the document tracking system.
      </p>
      <div className="mt-6 flex gap-2">
        <Link to="/" className="btn-primary">
          Back to dashboard
        </Link>
        <Link to="/register" className="btn-secondary">
          Open the register
        </Link>
      </div>
    </div>
  )
}
