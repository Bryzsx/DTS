import { useEffect, useState, type ReactNode } from "react"
import { NavLink, useLocation } from "react-router-dom"
import { useDarkMode } from "../hooks/useDarkMode"
import type { Role } from "../lib/types.js"

export interface NavItem {
  to: string
  label: string
  icon: string
}

const ROLE_LABEL: Record<Role, string> = {
  admin: "Administrator",
  officer: "Records Officer",
  rd: "Records Director",
  viewer: "Viewer",
}

export const ROLE_OPTIONS: Role[] = ["admin", "officer", "rd", "viewer"]

/**
 * DTS application frame.
 *
 * A dark navy sidebar with a gold rule — the look of an official records
 * system rather than a consumer SaaS dashboard. Collapses to a mobile drawer
 * below `lg`.
 */
export function AppShell({
  nav,
  userName,
  userEmail,
  userRole,
  onLogout,
  children,
}: {
  nav: NavItem[]
  userName: string
  userEmail: string
  userRole: Role
  onLogout: () => void
  children: ReactNode
}) {
  const [collapsed, setCollapsed] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const location = useLocation()
  const { isDark, toggle } = useDarkMode()

  useEffect(() => setDrawerOpen(false), [location.pathname])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setDrawerOpen(false)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  const isEnd = (to: string) => to.split("/").filter(Boolean).length === 1

  const navList = (isCollapsed: boolean) => (
    <nav className={`flex-1 space-y-0.5 overflow-y-auto py-3 ${isCollapsed ? "px-2" : "px-3"}`}>
      {nav.map(({ to, label, icon }) => (
        <NavLink
          key={to}
          to={to}
          end={isEnd(to)}
          title={isCollapsed ? label : undefined}
          className={({ isActive }) =>
            `nav-item relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
              isCollapsed ? "justify-center px-0" : ""
            } ${
              isActive
                ? "bg-white/10 text-white font-semibold"
                : "text-slate-300 hover:bg-white/5 hover:text-white"
            }`
          }
        >
          {({ isActive }) => (
            <>
              {isActive && (
                <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 bg-gold-500" />
              )}
              <svg
                className="h-[18px] w-[18px] shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.75}
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
              </svg>
              {!isCollapsed && <span className="truncate">{label}</span>}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )

  const footer = (isCollapsed: boolean) => (
    <div
      className={`mt-auto space-y-0.5 border-t border-white/10 py-3 ${isCollapsed ? "px-2" : "px-3"}`}
    >
      <div
        className={`flex items-center gap-2.5 py-2 ${isCollapsed ? "justify-center" : "px-2"}`}
        title={isCollapsed ? `${userName} — ${ROLE_LABEL[userRole]}` : undefined}
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gold-500/15 text-[11px] font-bold text-gold-200">
          {userName.charAt(0).toUpperCase()}
        </div>
        {!isCollapsed && (
          <div className="min-w-0 leading-tight">
            <span className="block truncate text-sm font-semibold text-white">{userName}</span>
            <span className="block truncate text-[11px] text-slate-400">
              {ROLE_LABEL[userRole]}
            </span>
          </div>
        )}
      </div>
      <button
        onClick={toggle}
        title={isCollapsed ? (isDark ? "Light mode" : "Dark mode") : undefined}
        className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-slate-300 transition-colors hover:bg-white/5 hover:text-white ${
          isCollapsed ? "justify-center px-0" : ""
        }`}
      >
        <svg
          className="h-4 w-4 shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.75}
          aria-hidden="true"
        >
          {isDark ? (
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 3v2m0 14v2m9-9h-2M5 12H3m15.36-6.36l-1.42 1.42M7.06 16.94l-1.42 1.42m13.72-1.42l-1.42-1.42M7.06 7.06L5.64 5.64M15 12a3 3 0 11-6 0 3 3 0 016 0z"
            />
          ) : (
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
            />
          )}
        </svg>
        {!isCollapsed && <span>{isDark ? "Light mode" : "Dark mode"}</span>}
      </button>
      <button
        onClick={onLogout}
        title={isCollapsed ? "Sign out" : undefined}
        className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-slate-300 transition-colors hover:bg-white/5 hover:text-white ${
          isCollapsed ? "justify-center px-0" : ""
        }`}
      >
        <svg
          className="h-4 w-4 shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.75}
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
          />
        </svg>
        {!isCollapsed && <span>Sign out</span>}
      </button>
    </div>
  )

  const wordmark = (isCollapsed: boolean) => (
    <div className={`flex items-center gap-2.5 ${isCollapsed ? "justify-center px-0" : "px-4"}`}>
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gold-500/40 bg-gold-500/10">
        <svg
          className="h-5 w-5 text-gold-300"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
      </div>
      {!isCollapsed && (
        <div className="leading-tight">
          <span className="block truncate text-sm font-extrabold tracking-tight text-white">
            DTS
          </span>
          <span className="block truncate text-[10px] font-semibold uppercase tracking-wider text-gold-300/80">
            Records System
          </span>
        </div>
      )}
    </div>
  )

  return (
    <div className="min-h-screen">
      <aside
        className={`fixed inset-y-0 left-0 z-30 hidden flex-col bg-navy-900 transition-[width] duration-200 lg:flex ${
          collapsed ? "w-[72px]" : "w-64"
        }`}
      >
        <div className="flex h-16 items-center border-b border-white/10">{wordmark(collapsed)}</div>
        {navList(collapsed)}
        {footer(collapsed)}
        <button
          onClick={() => setCollapsed((v) => !v)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="absolute -right-3 top-[72px] hidden h-6 w-6 items-center justify-center rounded-full border border-navy-700 bg-navy-800 text-slate-300 shadow-sm transition-colors hover:bg-navy-700 hover:text-white lg:flex"
        >
          <svg
            className="h-3.5 w-3.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d={collapsed ? "M9 5l7 7-7 7" : "M15 5l-7 7 7 7"}
            />
          </svg>
        </button>
      </aside>

      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-slate-200 bg-white/90 px-4 backdrop-blur lg:hidden dark:border-slate-700 dark:bg-slate-900/90">
        {wordmark(false)}
        <button
          onClick={() => setDrawerOpen(true)}
          aria-label="Open navigation"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-navy-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <svg
            className="h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.75}
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </header>

      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-navy-950/50" onClick={() => setDrawerOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-navy-900 shadow-xl">
            <div className="flex h-16 items-center justify-between border-b border-white/10">
              {wordmark(false)}
              <button
                onClick={() => setDrawerOpen(false)}
                aria-label="Close navigation"
                className="mr-3 flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-white"
              >
                <svg
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.75}
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {navList(false)}
            {footer(false)}
          </aside>
        </div>
      )}

      <main
        className={`min-h-screen bg-slate-50 dark:bg-slate-950 ${collapsed ? "lg:pl-[72px]" : "lg:pl-64"}`}
      >
        <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
          {children}
        </div>
      </main>
    </div>
  )
}

export { ROLE_LABEL }
