import { Bot } from "grammy"
import type { Logger } from "../logger.js"
import type { PluginSettings } from "../types.js"
import type { Router } from "./router.js"
import type { TelegramTransport } from "./transport.js"

export function createGrammyBot(token: string): Bot {
  return new Bot(token)
}

export function createGrammyTransport(bot: Bot): TelegramTransport {
  return {
    async sendCard(chatId, text, buttons) {
      const message = await bot.api.sendMessage(chatId, text, {
        reply_markup: buttons ? { inline_keyboard: buttons } : undefined,
      })
      return message.message_id
    },
    async editCard(chatId, messageId, text, buttons) {
      await bot.api.editMessageText(chatId, messageId, text, {
        // An empty inline_keyboard removes the keyboard; omitting reply_markup
        // would leave the existing buttons in place.
        reply_markup: { inline_keyboard: buttons ?? [] },
      })
    },
    async answerCallback(id, text) {
      await bot.api.answerCallbackQuery(id, text ? { text } : undefined)
    },
  }
}

function isAuthorized(settings: PluginSettings, userId?: number): boolean {
  if (!settings.allowedUserId) return true
  if (userId === undefined) return false
  return String(userId) === settings.allowedUserId
}

export function registerHandlers(
  bot: Bot,
  router: Router,
  settings: PluginSettings,
  logger: Logger,
): void {
  bot.on("callback_query:data", async (ctx) => {
    const chatId = ctx.chat?.id
    if (String(chatId) !== settings.chatId || !isAuthorized(settings, ctx.from?.id)) {
      await ctx.answerCallbackQuery().catch(() => undefined)
      return
    }
    try {
      await router.handleCallback({ id: ctx.callbackQuery.id, data: ctx.callbackQuery.data })
    } catch (error) {
      logger.error("callback handler failed", error)
    }
  })

  bot.on("message:text", async (ctx) => {
    if (String(ctx.chat.id) !== settings.chatId || !isAuthorized(settings, ctx.from?.id)) return
    try {
      const result = await router.handleText(String(ctx.chat.id), ctx.message.text)
      if (result.deleteMessage) await ctx.deleteMessage().catch(() => undefined)
    } catch (error) {
      logger.error("text handler failed", error)
    }
  })
}

export function startBot(bot: Bot, router: Router, settings: PluginSettings, logger: Logger): void {
  registerHandlers(bot, router, settings, logger)
  void bot
    .start({ allowed_updates: ["message", "callback_query"] })
    .catch((error) => logger.error("telegram bot polling stopped", error))
}

export function stopBot(bot: Bot): void {
  void bot.stop().catch(() => undefined)
}
