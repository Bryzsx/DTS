import { useCallback, useEffect, useState } from "react"

const STORAGE_KEY = "dts-theme"

function getInitial(): boolean {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === "dark") return true
  if (stored === "light") return false
  return window.matchMedia("(prefers-color-scheme: dark)").matches
}

function applyTheme(isDark: boolean) {
  document.documentElement.classList.toggle("dark", isDark)
  const meta = document.querySelector('meta[name="theme-color"]')
  // Matches navy-950 in index.css.
  if (meta) meta.setAttribute("content", isDark ? "#051429" : "#0B2545")
}

export function useDarkMode() {
  const [isDark, setIsDark] = useState(getInitial)

  useEffect(() => {
    applyTheme(isDark)
    localStorage.setItem(STORAGE_KEY, isDark ? "dark" : "light")
  }, [isDark])

  const toggle = useCallback(() => setIsDark((d) => !d), [])

  return { isDark, toggle }
}
