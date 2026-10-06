import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"

type ToastKind = "success" | "error" | "info"

interface ToastItem {
  id: number
  kind: ToastKind
  message: string
  exiting: boolean
}

interface ToastApi {
  toast: (kind: ToastKind, message: string) => void
}

export const ToastContext = createContext<ToastApi | null>(null)

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>")
  return ctx
}

const kindStyles: Record<ToastKind, { icon: string; wrap: string; iconBg: string }> = {
  success: {
    icon: "M5 13l4 4L19 7",
    wrap: "ring-brand-600/20",
    iconBg: "bg-brand-50 text-brand-600",
  },
  error: {
    icon: "M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
    wrap: "ring-red-600/20",
    iconBg: "bg-red-50 text-red-600",
  },
  info: {
    icon: "M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
    wrap: "ring-slate-900/10",
    iconBg: "bg-slate-100 text-slate-600",
  },
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const dismiss = useCallback((id: number) => {
    setToasts((t) => t.map((x) => (x.id === id ? { ...x, exiting: true } : x)))
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 300)
  }, [])

  const toast = useCallback(
    (kind: ToastKind, message: string) => {
      const id = Date.now() + Math.random()
      setToasts((t) => [...t.slice(-3), { id, kind, message, exiting: false }])
      setTimeout(() => dismiss(id), 4000)
    },
    [dismiss],
  )

  const api = useMemo(() => ({ toast }), [toast])

  useEffect(() => {
    const onPush = (e: Event) => {
      const detail = (e as CustomEvent<{ title: string; body: string }>).detail
      toast("info", `${detail.title}: ${detail.body}`)
    }
    window.addEventListener("doorify:push-toast", onPush)
    return () => window.removeEventListener("doorify:push-toast", onPush)
  }, [toast])

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed bottom-4 right-4 z-[70] flex w-full max-w-sm flex-col gap-2"
      >
        {toasts.map((t) => {
          const s = kindStyles[t.kind]
          return (
            <div
              key={t.id}
              className={`pointer-events-auto flex items-center gap-3 rounded-xl bg-white px-4 py-3 shadow-pop ring-1 ${s.wrap} ${
                t.exiting ? "animate-slide-down opacity-0" : "animate-slide-up"
              }`}
              style={{ transition: "opacity 0.3s, transform 0.3s" }}
            >
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${s.iconBg}`}
              >
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d={s.icon} />
                </svg>
              </span>
              <p className="text-sm font-medium text-slate-900">{t.message}</p>
              <button
                onClick={() => dismiss(t.id)}
                className="ml-auto shrink-0 rounded-lg p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                aria-label="Dismiss"
              >
                <svg
                  className="h-3.5 w-3.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}
