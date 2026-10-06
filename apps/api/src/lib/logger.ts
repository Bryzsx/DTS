type Level = "debug" | "info" | "warn" | "error"

const LEVEL_PRIORITY: Record<Level, number> = { debug: 0, info: 1, warn: 2, error: 3 }
const MIN_LEVEL: Level =
  (process.env.LOG_LEVEL as Level) || (process.env.NODE_ENV === "production" ? "info" : "debug")

function shouldLog(level: Level): boolean {
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[MIN_LEVEL]
}

function emit(level: Level, tag: string, msg: string, data?: unknown) {
  if (!shouldLog(level)) return
  const ts = new Date().toISOString()
  const prefix = `${ts} [${level.toUpperCase()}] [${tag}]`
  if (data !== undefined) {
    console[level === "error" ? "error" : level === "warn" ? "warn" : "log"](
      `${prefix} ${msg}`,
      data,
    )
  } else {
    console[level === "error" ? "error" : level === "warn" ? "warn" : "log"](`${prefix} ${msg}`)
  }
}

export function createLogger(tag: string) {
  return {
    debug: (msg: string, data?: unknown) => emit("debug", tag, msg, data),
    info: (msg: string, data?: unknown) => emit("info", tag, msg, data),
    warn: (msg: string, data?: unknown) => emit("warn", tag, msg, data),
    error: (msg: string, data?: unknown) => emit("error", tag, msg, data),
  }
}
