import type { ReactNode } from "react"
import { Navigate, useLocation } from "react-router-dom"
import { useAuth } from "../lib/useAuth"
import { can, type PermissionAction } from "../lib/permissions"
import { Spinner } from "./ui/Spinner"

/**
 * Gate for authenticated routes.
 *
 * `permission` additionally checks a role capability, so a viewer deep-linking
 * to /users lands on the dashboard rather than seeing an empty page.
 */
export function ProtectedRoute({
  permission,
  children,
}: {
  permission?: PermissionAction
  children: ReactNode
}) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner label="Verifying your session" />
      </div>
    )
  }
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (permission && !can(user.role, permission)) return <Navigate to="/" replace />

  return children
}
