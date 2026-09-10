import type { QuestionInfo } from "./types.js"

export type PendingPermission = {
  kind: "permission"
  requestId: string
  sessionID: string
  directory?: string
  chatId: string
  messageId: number
}

export type PendingQuestion = {
  kind: "question"
  requestId: string
  sessionID: string
  directory?: string
  chatId: string
  messageId: number
  questions: QuestionInfo[]
  currentIndex: number
  selections: Map<number, Set<number>>
  customAnswers: Map<number, string>
  awaitingCustomFor: number | null
  planReview: boolean
}

export type Pending = PendingPermission | PendingQuestion

export class PendingStore {
  private readonly byRequest = new Map<string, Pending>()
  private readonly awaitingCustomByChat = new Map<string, string>()

  addPermission(pending: PendingPermission): void {
    this.byRequest.set(pending.requestId, pending)
  }

  addQuestion(pending: PendingQuestion): void {
    this.byRequest.set(pending.requestId, pending)
  }

  get(requestId: string): Pending | undefined {
    return this.byRequest.get(requestId)
  }

  setMessageId(requestId: string, messageId: number): void {
    const pending = this.byRequest.get(requestId)
    if (pending) pending.messageId = messageId
  }

  remove(requestId: string): Pending | undefined {
    const pending = this.byRequest.get(requestId)
    if (!pending) return undefined
    this.byRequest.delete(requestId)
    if (pending.kind === "question" && pending.awaitingCustomFor !== null) {
      this.clearAwaitingCustom(pending.chatId)
    }
    return pending
  }

  setAwaitingCustom(chatId: string, requestId: string, qIndex: number): void {
    const pending = this.byRequest.get(requestId)
    if (!pending || pending.kind !== "question") return
    pending.awaitingCustomFor = qIndex
    this.awaitingCustomByChat.set(chatId, requestId)
  }

  clearAwaitingCustom(chatId: string): void {
    const requestId = this.awaitingCustomByChat.get(chatId)
    this.awaitingCustomByChat.delete(chatId)
    if (!requestId) return
    const pending = this.byRequest.get(requestId)
    if (pending && pending.kind === "question") pending.awaitingCustomFor = null
  }

  getAwaitingCustom(chatId: string): PendingQuestion | undefined {
    const requestId = this.awaitingCustomByChat.get(chatId)
    if (!requestId) return undefined
    const pending = this.byRequest.get(requestId)
    return pending && pending.kind === "question" ? pending : undefined
  }

  values(): Pending[] {
    return [...this.byRequest.values()]
  }
}
