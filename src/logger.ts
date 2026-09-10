import { appendFileSync, mkdirSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import type { LogLevel } from "./types.js"

const ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 }

export type LogSink = (line: string) => void

export const DEFAULT_LOG_PATH = join(homedir(), ".local/state/opencode-telegram/plugin.log")

export function createFileSink(path: string = DEFAULT_LOG_PATH): LogSink {
  let directoryReady = false
  return (line) => {
    try {
      if (!directoryReady) {
        mkdirSync(dirname(path), { recursive: true })
        directoryReady = true
      }
      appendFileSync(path, `${line}\n`)
    } catch {
      /* never let logging break the plugin */
    }
  }
}

function formatArg(value: unknown): string {
  if (typeof value === "string") return value
  if (value instanceof Error) return value.stack ?? value.message
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

export type Logger = {
  debug: (...args: unknown[]) => void
  info: (...args: unknown[]) => void
  warn: (...args: unknown[]) => void
  error: (...args: unknown[]) => void
}

export function createLogger(level: LogLevel, sink?: LogSink): Logger {
  const min = ORDER[level]
  const emit = (l: LogLevel, args: unknown[]) => {
    if (ORDER[l] < min || !sink) return
    sink(`[telegram-opencode] ${l}: ${args.map(formatArg).join(" ")}`)
  }
  return {
    debug: (...args) => emit("debug", args),
    info: (...args) => emit("info", args),
    warn: (...args) => emit("warn", args),
    error: (...args) => emit("error", args),
  }
}
