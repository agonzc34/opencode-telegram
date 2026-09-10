import { decodeCallback, type DecodedCallback } from "../callbacks.js"
import type { Logger } from "../logger.js"
import type { OpenCodeApi } from "../opencode.js"
import { PendingStore, type PendingPermission, type PendingQuestion } from "../state.js"
import type {
  PermissionRequestInfo,
  PluginSettings,
  QuestionInfo,
  QuestionRequestInfo,
} from "../types.js"
import {
  buildAnswers,
  permissionCard,
  permissionResolvedText,
  questionAwaitingText,
  questionCard,
  questionResolvedText,
  questionSummaryText,
} from "./render.js"
import type { TelegramTransport } from "./transport.js"

export type RouterDeps = {
  settings: PluginSettings
  store: PendingStore
  transport: TelegramTransport
  api: OpenCodeApi
  logger: Logger
  directory: string
  projectName: string
  isPlanExitCall: (callID: string) => boolean
}

function decisionLabel(decision: "once" | "always" | "reject"): string {
  if (decision === "once") return "✅ Allowed once"
  if (decision === "always") return "✅ Always allowed"
  return "❌ Rejected"
}

function decisionToast(decision: "once" | "always" | "reject"): string {
  if (decision === "once") return "Allowed once"
  if (decision === "always") return "Always allowed"
  return "Rejected"
}

async function safeAnswer(
  transport: TelegramTransport,
  id: string,
  text?: string,
): Promise<void> {
  try {
    await transport.answerCallback(id, text)
  } catch {
    /* ignore */
  }
}

function looksLikePlanReview(questions: QuestionInfo[]): boolean {
  return questions.length === 1 && questions[0]?.header === "Build Agent"
}

export class Router {
  constructor(private readonly deps: RouterDeps) {}

  private async sessionLabel(sessionID: string): Promise<string | undefined> {
    try {
      return await this.deps.api.getSessionTitle(sessionID, this.deps.directory)
    } catch {
      return undefined
    }
  }

  async handlePermissionAsked(request: PermissionRequestInfo): Promise<void> {
    const { settings, store, transport, logger } = this.deps
    const session = await this.sessionLabel(request.sessionID)
    const card = permissionCard({
      permission: request.permission,
      patterns: request.patterns,
      always: request.always,
      project: this.deps.projectName,
      session,
      requestId: request.id,
      maxChars: settings.maxMessageChars,
    })
    try {
      const messageId = await transport.sendCard(settings.chatId, card.text, card.buttons)
      const pending: PendingPermission = {
        kind: "permission",
        requestId: request.id,
        sessionID: request.sessionID,
        directory: this.deps.directory,
        chatId: settings.chatId,
        messageId,
      }
      store.addPermission(pending)
    } catch (error) {
      logger.error("failed to send permission card", error)
    }
  }

  async handlePermissionReplied(requestId: string): Promise<void> {
    const { store, transport, logger } = this.deps
    const pending = store.remove(requestId)
    if (!pending || pending.kind !== "permission") return
    try {
      await transport.editCard(
        pending.chatId,
        pending.messageId,
        permissionResolvedText("⤷ Answered in TUI"),
      )
    } catch (error) {
      logger.debug("failed to edit permission card", error)
    }
  }

  async handleQuestionAsked(request: QuestionRequestInfo): Promise<void> {
    const { settings, store, transport, logger } = this.deps
    const session = await this.sessionLabel(request.sessionID)
    const planReview = request.tool
      ? this.deps.isPlanExitCall(request.tool.callID) || looksLikePlanReview(request.questions)
      : looksLikePlanReview(request.questions)
    const pending: PendingQuestion = {
      kind: "question",
      requestId: request.id,
      sessionID: request.sessionID,
      directory: this.deps.directory,
      chatId: settings.chatId,
      messageId: 0,
      questions: request.questions,
      currentIndex: 0,
      selections: new Map(),
      customAnswers: new Map(),
      awaitingCustomFor: null,
      planReview,
    }
    store.addQuestion(pending)
    try {
      const card = questionCard(pending, settings.maxMessageChars, session)
      const messageId = await transport.sendCard(settings.chatId, card.text, card.buttons)
      store.setMessageId(request.id, messageId)
    } catch (error) {
      logger.error("failed to send question card", error)
      store.remove(request.id)
    }
  }

  async handleQuestionClosed(requestId: string): Promise<void> {
    const { store, transport, logger } = this.deps
    const pending = store.remove(requestId)
    if (!pending || pending.kind !== "question") return
    try {
      await transport.editCard(
        pending.chatId,
        pending.messageId,
        questionResolvedText(pending, "⤷ Answered in TUI"),
      )
    } catch (error) {
      logger.debug("failed to edit question card", error)
    }
  }

  async handleCallback(query: { id: string; data: string }): Promise<void> {
    const { store, transport, api, logger, directory } = this.deps
    const decoded = decodeCallback(query.data)
    if (!decoded) {
      await safeAnswer(transport, query.id)
      return
    }
    try {
      if (decoded.kind === "permission") {
        const pending = store.get(decoded.requestId)
        await api.replyPermission({
          requestID: decoded.requestId,
          reply: decoded.decision,
          directory,
        })
        store.remove(decoded.requestId)
        if (pending && pending.kind === "permission") {
          await transport.editCard(
            pending.chatId,
            pending.messageId,
            permissionResolvedText(decisionLabel(decoded.decision)),
          )
        }
        await safeAnswer(transport, query.id, decisionToast(decoded.decision))
        return
      }

      const pending = store.get(decoded.requestId)
      if (!pending || pending.kind !== "question") {
        await safeAnswer(transport, query.id, "This request is no longer active.")
        return
      }
      if (decoded.kind === "question-option") {
        await this.applyOption(pending, decoded.qIndex, decoded.optIndex, query.id)
      } else {
        await this.applyControl(pending, decoded, query.id)
      }
    } catch (error) {
      logger.error("callback handling failed", error)
      await safeAnswer(transport, query.id, "Something went wrong.")
    }
  }

  private async applyOption(
    pending: PendingQuestion,
    qIndex: number,
    optIndex: number,
    queryId: string,
  ): Promise<void> {
    const { transport } = this.deps
    const question = pending.questions[qIndex]
    if (!question || !question.options[optIndex]) {
      await safeAnswer(transport, queryId)
      return
    }
    if (question.multiple) {
      const selected = pending.selections.get(qIndex) ?? new Set<number>()
      if (selected.has(optIndex)) selected.delete(optIndex)
      else selected.add(optIndex)
      pending.selections.set(qIndex, selected)
      await this.editQuestionCard(pending)
      await safeAnswer(transport, queryId)
      return
    }
    pending.selections.set(qIndex, new Set([optIndex]))
    await safeAnswer(transport, queryId)
    await this.advance(pending)
  }

  private async applyControl(
    pending: PendingQuestion,
    decoded: Extract<DecodedCallback, { kind: "question-control" }>,
    queryId: string,
  ): Promise<void> {
    const { store, transport, api, directory } = this.deps
    if (decoded.control === "cancel") {
      await api.rejectQuestion({ requestID: pending.requestId, directory })
      store.remove(pending.requestId)
      await transport.editCard(
        pending.chatId,
        pending.messageId,
        questionResolvedText(pending, "⏹ Cancelled"),
      )
      await safeAnswer(transport, queryId, "Cancelled")
      return
    }
    if (decoded.control === "custom") {
      store.setAwaitingCustom(pending.chatId, pending.requestId, decoded.qIndex)
      await transport.editCard(
        pending.chatId,
        pending.messageId,
        questionAwaitingText(pending, decoded.qIndex, this.deps.settings.maxMessageChars),
      )
      await safeAnswer(transport, queryId, "Send your answer as a text message")
      return
    }
    if (decoded.control === "skip") pending.selections.set(decoded.qIndex, new Set())
    await safeAnswer(transport, queryId)
    await this.advance(pending)
  }

  private async advance(pending: PendingQuestion): Promise<void> {
    if (pending.currentIndex < pending.questions.length - 1) {
      pending.currentIndex += 1
      await this.editQuestionCard(pending)
      return
    }
    await this.finalize(pending)
  }

  private async editQuestionCard(pending: PendingQuestion): Promise<void> {
    const { settings, transport, logger } = this.deps
    try {
      const session = await this.sessionLabel(pending.sessionID)
      const card = questionCard(pending, settings.maxMessageChars, session)
      await transport.editCard(pending.chatId, pending.messageId, card.text, card.buttons)
    } catch (error) {
      logger.debug("failed to edit question card", error)
    }
  }

  private async finalize(pending: PendingQuestion): Promise<void> {
    const { store, transport, api, logger, directory } = this.deps
    const answers = buildAnswers(pending)
    await api.replyQuestion({ requestID: pending.requestId, answers, directory })
    store.remove(pending.requestId)
    await transport.editCard(pending.chatId, pending.messageId, questionSummaryText(pending))
    logger.info("question answered", pending.requestId)
  }

  async handleText(chatId: string, text: string): Promise<boolean> {
    const { store } = this.deps
    const pending = store.getAwaitingCustom(chatId)
    if (!pending) return false
    const qIndex = pending.awaitingCustomFor
    if (qIndex === null) return false
    pending.customAnswers.set(qIndex, text.trim())
    pending.selections.set(qIndex, new Set())
    store.clearAwaitingCustom(chatId)
    await this.advance(pending)
    return true
  }
}
