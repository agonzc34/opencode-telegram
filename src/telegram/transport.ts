import type { InlineButton } from "../types.js"

export interface TelegramTransport {
  sendCard(chatId: string, text: string, buttons?: InlineButton[][]): Promise<number>
  editCard(chatId: string, messageId: number, text: string, buttons?: InlineButton[][]): Promise<void>
  answerCallback(callbackQueryId: string, text?: string): Promise<void>
}
