import type { Plugin, PluginInput, PluginOptions } from "@opencode-ai/plugin"
import { basename, join } from "node:path"
import { homedir } from "node:os"
import { loadSettings } from "./config.js"
import { acquireLock } from "./lock.js"
import { createLogger } from "./logger.js"
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

export const TelegramPlugin: Plugin = async (input: PluginInput, options?: PluginOptions) => {
  const shouldStartBot = options?.startBot !== false

  const resolved = loadSettings(undefined, options ?? {})
  if (!resolved.ok) {
    console.error(`[telegram-opencode] disabled: ${resolved.reason}`)
    return {}
  }
  const settings = resolved.settings
  if (!settings.enabled) {
    console.error("[telegram-opencode] disabled via TELEGRAM_OPENCODE_ENABLED")
    return {}
  }

  const logger = createLogger(settings.logLevel)
  const store = new PendingStore()
  const api = createOpenCodeApi(input.client as any, logger)
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
