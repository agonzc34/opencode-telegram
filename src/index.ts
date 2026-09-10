import type { Plugin, PluginInput, PluginOptions } from "@opencode-ai/plugin"
import { createOpencodeClient as createV2Client } from "@opencode-ai/sdk/v2"
import { basename, join } from "node:path"
import { homedir } from "node:os"
import { loadSettings } from "./config.js"
import { acquireLock } from "./lock.js"
import { createLogger, createFileSink } from "./logger.js"
import { createOpenCodeApi } from "./opencode.js"
import { PendingStore } from "./state.js"
import { buildHooks } from "./plugin.js"
import { createGrammyBot, createGrammyTransport, startBot, stopBot } from "./telegram/bot.js"
import { Router } from "./telegram/router.js"
import type { TelegramTransport } from "./telegram/transport.js"

const LOCK_PATH = join(homedir(), ".local/state/opencode-telegram/bot.lock")

const NOOP_TRANSPORT: TelegramTransport = {
  async sendCard() {
    return 0
  },
  async editCard() {},
  async answerCallback() {},
}

// The client injected into a plugin is the v1 SDK, which has no `question`
// namespace and uses a legacy permission method. Derive a v2 client from the
// injected client's config (base URL + headers) so replies target the right API.
function createV2FromInput(input: PluginInput): unknown {
  const injected = input.client as unknown as { _client?: { getConfig?: () => Record<string, any> } }
  const config = injected?._client?.getConfig?.() ?? {}
  const headers = { ...(config.headers ?? {}) }
  delete headers["x-opencode-directory"]
  delete headers["content-type"]
  return createV2Client({
    baseUrl: config.baseUrl ?? input.serverUrl?.toString(),
    headers,
    directory: input.directory,
    ...(config.fetch ? { fetch: config.fetch } : {}),
  } as any)
}

export const TelegramPlugin: Plugin = async (input: PluginInput, options?: PluginOptions) => {
  const shouldStartBot = options?.startBot !== false
  // Logs go to a file only; never to stdout/stderr, which the TUI surfaces.
  const sink = createFileSink()

  const resolved = loadSettings(undefined, options ?? {})
  if (!resolved.ok) {
    createLogger("error", sink).error(`disabled: ${resolved.reason}`)
    return {}
  }
  const settings = resolved.settings
  if (!settings.enabled) {
    createLogger("error", sink).error("disabled via TELEGRAM_OPENCODE_ENABLED")
    return {}
  }

  const logger = createLogger(settings.logLevel, sink)
  const store = new PendingStore()
  const api = createOpenCodeApi(createV2FromInput(input) as any, logger)
  const directory = input.directory
  const projectName = basename(input.worktree || input.directory)
  const planExitCalls = new Set<string>()

  const lock = shouldStartBot ? acquireLock(LOCK_PATH) : null
  let bot: ReturnType<typeof createGrammyBot> | null = null
  let transport: TelegramTransport = NOOP_TRANSPORT

  if (shouldStartBot) {
    if (!lock) {
      // Another opencode instance owns the bot; the no-op transport stays in place.
      logger.warn("another opencode instance owns the telegram bot; notifications disabled here")
    } else {
      bot = createGrammyBot(settings.botToken)
      transport = createGrammyTransport(bot)
    }
  }

  const router = new Router({
    settings,
    store,
    transport,
    api,
    logger,
    directory,
    projectName,
    isPlanExitCall: (callID) => planExitCalls.has(callID),
  })

  if (bot) {
    startBot(bot, router, settings, logger)
    const release = lock?.release
    const shutdown = () => {
      if (bot) stopBot(bot)
      release?.()
    }
    process.once("SIGINT", shutdown)
    process.once("SIGTERM", shutdown)
    logger.info("telegram bot started")
  }

  return buildHooks(router, planExitCalls)
}

export default TelegramPlugin
