import { useState, useRef, type ReactNode } from "react"

export function Tooltip({
  children,
  content,
  side = "right",
  delay = 400,
}: {
  children: ReactNode
  content: string
  side?: "top" | "bottom" | "left" | "right"
  delay?: number
}) {
  const [show, setShow] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const open = () => {
    timer.current = setTimeout(() => setShow(true), delay)
  }
  const close = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    setShow(false)
  }

  const pos = {
    top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
    bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
    left: "right-full top-1/2 -translate-y-1/2 mr-2",
    right: "left-full top-1/2 -translate-y-1/2 ml-2",
  }

  return (
    <div
      className="relative inline-flex"
      onMouseEnter={open}
      onMouseLeave={close}
      onFocus={open}
      onBlur={close}
    >
      {children}
      {show && (
        <div
          role="tooltip"
          className={`absolute z-50 whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white shadow-pop animate-fade-in pointer-events-none ${pos[side]}`}
        >
          {content}
        </div>
      )}
    </div>
  )
}
