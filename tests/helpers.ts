import { Router } from "../src/telegram/router.js"
import type { TelegramTransport } from "../src/telegram/transport.js"
import type { OpenCodeApi } from "../src/opencode.js"
import { PendingStore } from "../src/state.js"
import { createLogger } from "../src/logger.js"
import type { PluginSettings } from "../src/types.js"
import type { MessageLike } from "../src/snippet.js"

export function fakeTransport() {
  const sent: Array<{ chatId: string; text: string; buttons?: any }> = []
  const edits: Array<{ chatId: string; messageId: number; text: string }> = []
  const answers: Array<{ id: string; text?: string }> = []
  let nextMessageId = 100
  const transport: TelegramTransport = {
    async sendCard(chatId, text, buttons) {
      sent.push({ chatId, text, buttons })
      return nextMessageId++
    },
    async editCard(chatId, messageId, text) {
      edits.push({ chatId, messageId, text })
    },
    async answerCallback(id, text) {
      answers.push({ id, text })
    },
  }
  return { transport, sent, edits, answers }
}

export function fakeApi() {
  const permissions: any[] = []
  const questions: any[] = []
  const rejects: any[] = []
  const prompts: any[] = []
  let messages: MessageLike[] = []
  let sessionInfo: { title?: string; parentID?: string } | undefined = { title: "My Session" }
  const api: OpenCodeApi = {
    async replyPermission(input) {
      permissions.push(input)
    },
    async replyQuestion(input) {
      questions.push(input)
    },
    async rejectQuestion(input) {
      rejects.push(input)
    },
    async getSessionInfo() {
      return sessionInfo
    },
    async listSessionMessages() {
      return messages
    },
    async sendSessionPrompt(sessionID, text, directory) {
      prompts.push({ sessionID, text, directory })
      return true
    },
  }
  return {
    api,
    permissions,
    questions,
    rejects,
    prompts,
    setMessages: (next: MessageLike[]) => {
      messages = next
    },
    setSessionInfo: (next: { title?: string; parentID?: string } | undefined) => {
      sessionInfo = next
    },
  }
}

export const settings: PluginSettings = {
  botToken: "t",
  chatId: "c1",
  enabled: true,
  maxMessageChars: 3500,
  logLevel: "error",
  completionEnabled: true,
  completionSentences: 2,
}

export function makeRouter(overrides: Partial<PluginSettings> = {}) {
  const { transport, sent, edits, answers } = fakeTransport()
  const { api, permissions, questions, rejects, prompts, setMessages, setSessionInfo } = fakeApi()
  const store = new PendingStore()
  const router = new Router({
    settings: { ...settings, ...overrides },
    store,
    transport,
    api,
    logger: createLogger("error"),
    directory: "/proj",
    projectName: "proj",
    isPlanExitCall: () => false,
  })
  return {
    router,
    store,
    transport,
    sent,
    edits,
    answers,
    permissions,
    questions,
    rejects,
    prompts,
    setMessages,
    setSessionInfo,
  }
}
