import type { LogLevel } from "./types.js"

const ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 }

export type Logger = {
  debug: (...args: unknown[]) => void
  info: (...args: unknown[]) => void
  warn: (...args: unknown[]) => void
  error: (...args: unknown[]) => void
}

export function createLogger(level: LogLevel): Logger {
  const min = ORDER[level]
  const emit = (l: LogLevel, args: unknown[]) => {
    if (ORDER[l] >= min) console.error(`[telegram-opencode] ${l}:`, ...args)
  }
  return {
    debug: (...args) => emit("debug", args),
    info: (...args) => emit("info", args),
    warn: (...args) => emit("warn", args),
    error: (...args) => emit("error", args),
  }
}
