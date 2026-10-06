import { useMemo } from "react"
import { Navigate, Route, Routes } from "react-router-dom"
import { AppShell, type NavItem } from "./components/AppShell.js"
import { ProtectedRoute } from "./components/ProtectedRoute.js"
import { useAuth } from "./lib/useAuth.js"
import { can } from "./lib/permissions.js"
import Login from "./pages/Login.js"
import Dashboard from "./pages/Dashboard.js"
import DocumentRegister from "./pages/DocumentRegister.js"
import DocumentDetail from "./pages/DocumentDetail.js"
import DocumentForm from "./pages/DocumentForm.js"
import PrintRegister from "./pages/PrintRegister.js"
import PrintRecordSheet from "./pages/PrintRecordSheet.js"
import ManageUsers from "./pages/ManageUsers.js"
import AuditTrail from "./pages/AuditTrail.js"
import Settings from "./pages/Settings.js"
import NotFound from "./pages/NotFound.js"

const ICONS = {
  dashboard: "M3 12l9-9 9 9M5 10v9a1 1 0 001 1h4v-6h4v6h4a1 1 0 001-1v-9",
  register:
    "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4",
  intake: "M12 4v16m8-8H4",
  audit:
    "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
  users:
    "M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-1.13a4 4 0 10-4-4 4 4 0 004 4zM16 3.13a4 4 0 010 7.75",
  settings:
    "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065zM15 12a3 3 0 11-6 0 3 3 0 016 0z",
} as const

export default function App() {
  const { user, logout } = useAuth()

  const nav = useMemo<NavItem[]>(() => {
    if (!user) return []
    const items: NavItem[] = [
      { to: "/", label: "Dashboard", icon: ICONS.dashboard },
      { to: "/register", label: "Document Register", icon: ICONS.register },
    ]
    if (can(user.role, "createDocument")) {
      items.push({ to: "/documents/new", label: "Intake Document", icon: ICONS.intake })
    }
    if (can(user.role, "viewAuditTrail")) {
      items.push({ to: "/audit", label: "Audit Trail", icon: ICONS.audit })
      items.push({ to: "/users", label: "User Accounts", icon: ICONS.users })
      items.push({ to: "/settings", label: "Settings", icon: ICONS.settings })
    }
    return items
  }, [user])

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      {/* Print views render bare — no navigation chrome on paper. */}
      <Route
        path="/print/register"
        element={
          <ProtectedRoute>
            <PrintRegister />
          </ProtectedRoute>
        }
      />
      <Route
        path="/print/document/:id"
        element={
          <ProtectedRoute>
            <PrintRecordSheet />
          </ProtectedRoute>
        }
      />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            {user && (
              <AppShell
                nav={nav}
                userName={user.name}
                userEmail={user.email}
                userRole={user.role}
                onLogout={logout}
              >
                <Routes>
                  <Route index element={<Dashboard />} />
                  <Route path="register" element={<DocumentRegister />} />
                  <Route
                    path="documents/new"
                    element={
                      <ProtectedRoute permission="createDocument">
                        <DocumentForm />
                      </ProtectedRoute>
                    }
                  />
                  <Route path="documents/:id" element={<DocumentDetail />} />
                  <Route
                    path="documents/:id/edit"
                    element={
                      <ProtectedRoute permission="editIntake">
                        <DocumentForm />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="audit"
                    element={
                      <ProtectedRoute permission="viewAuditTrail">
                        <AuditTrail />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="users"
                    element={
                      <ProtectedRoute permission="manageUsers">
                        <ManageUsers />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="settings"
                    element={
                      <ProtectedRoute permission="manageSettings">
                        <Settings />
                      </ProtectedRoute>
                    }
                  />
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </AppShell>
            )}
          </ProtectedRoute>
        }
      />
    </Routes>
  )
}
