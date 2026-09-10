import { existsSync, readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import type { LogLevel, PluginSettings } from "./types.js"

export const DEFAULT_ENV_PATH = join(homedir(), ".config/opencode/telegram.env")

const LOG_LEVELS: LogLevel[] = ["debug", "info", "warn", "error"]

export function parseEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith("#")) continue
    const eq = line.indexOf("=")
    if (eq === -1) continue
    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()
    const quoted =
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    if (quoted && value.length >= 2) value = value.slice(1, -1)
    out[key] = value
  }
  return out
}

export type ResolveResult =
  | { ok: true; settings: PluginSettings }
  | { ok: false; reason: string }

export function resolveSettings(
  sources: Array<Record<string, string | undefined>>,
): ResolveResult {
  const merged: Record<string, string | undefined> = {}
  for (const source of sources) {
    for (const [key, value] of Object.entries(source)) {
      if (value !== undefined) merged[key] = value
    }
  }

  const botToken = merged.TELEGRAM_BOT_TOKEN?.trim()
  if (!botToken) return { ok: false, reason: "TELEGRAM_BOT_TOKEN is missing" }

  const chatId = merged.TELEGRAM_CHAT_ID?.trim()
  if (!chatId) return { ok: false, reason: "TELEGRAM_CHAT_ID is missing" }

  const enabledRaw = (merged.TELEGRAM_OPENCODE_ENABLED ?? "true").trim().toLowerCase()
  const enabled = !["false", "0", "no", "off"].includes(enabledRaw)

  const levelRaw = (merged.TELEGRAM_LOG_LEVEL ?? "info").trim().toLowerCase()
  const logLevel = (LOG_LEVELS.includes(levelRaw as LogLevel) ? levelRaw : "info") as LogLevel

  const maxRaw = Number.parseInt(merged.TELEGRAM_MAX_MESSAGE_CHARS ?? "", 10)
  const maxMessageChars = Number.isFinite(maxRaw) && maxRaw > 0 ? maxRaw : 3500

  return {
    ok: true,
    settings: {
      botToken,
      chatId,
      allowedUserId: merged.TELEGRAM_ALLOWED_USER_ID?.trim() || undefined,
      enabled,
      maxMessageChars,
      logLevel,
    },
  }
}

export function loadSettings(
  envPath: string = process.env.OPENCODE_TELEGRAM_ENV || DEFAULT_ENV_PATH,
  options: Record<string, unknown> = {},
): ResolveResult {
  let fileVars: Record<string, string> = {}
  if (existsSync(envPath)) {
    try {
      fileVars = parseEnv(readFileSync(envPath, "utf8"))
    } catch {
      return { ok: false, reason: `cannot read ${envPath}` }
    }
  }

  const optionVars: Record<string, string | undefined> = {
    TELEGRAM_BOT_TOKEN: options.botToken as string | undefined,
    TELEGRAM_CHAT_ID: options.chatId as string | undefined,
    TELEGRAM_ALLOWED_USER_ID: options.allowedUserId as string | undefined,
    TELEGRAM_OPENCODE_ENABLED:
      options.enabled === undefined ? undefined : String(options.enabled),
    TELEGRAM_MAX_MESSAGE_CHARS:
      options.maxMessageChars === undefined ? undefined : String(options.maxMessageChars),
    TELEGRAM_LOG_LEVEL: options.logLevel as string | undefined,
  }

  return resolveSettings([fileVars, process.env, optionVars])
}
