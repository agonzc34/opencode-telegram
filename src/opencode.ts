import type { Logger } from "./logger.js"
import type { MessageLike } from "./snippet.js"

export type PermissionDecision = "once" | "always" | "reject"

export type SessionInfo = { title?: string; parentID?: string }

export type OpenCodeApi = {
  replyPermission(input: {
    requestID: string
    reply: PermissionDecision
    directory?: string
  }): Promise<void>
  replyQuestion(input: {
    requestID: string
    answers: string[][]
    directory?: string
  }): Promise<void>
  rejectQuestion(input: { requestID: string; directory?: string }): Promise<void>
  getSessionInfo(sessionID: string, directory?: string): Promise<SessionInfo | undefined>
  listSessionMessages(sessionID: string, directory?: string): Promise<MessageLike[]>
  sendSessionPrompt(sessionID: string, text: string, directory?: string): Promise<boolean>
}

type SdkResult<T> = { data?: T; error?: unknown }

export type SdkLike = {
  permission: {
    reply(input: {
      requestID: string
      reply: PermissionDecision
      directory?: string
    }): Promise<SdkResult<unknown>>
  }
  question: {
    reply(input: {
      requestID: string
      answers: string[][]
      directory?: string
    }): Promise<SdkResult<unknown>>
    reject(input: { requestID: string; directory?: string }): Promise<SdkResult<unknown>>
  }
  session: {
    get(input: {
      sessionID: string
      directory?: string
    }): Promise<SdkResult<{ title?: string; parentID?: string }>>
    messages(input: {
      sessionID: string
      directory?: string
    }): Promise<SdkResult<MessageLike[]>>
    prompt(input: {
      sessionID: string
      directory?: string
      parts: Array<{ type: "text"; text: string }>
    }): Promise<SdkResult<unknown>>
  }
}

export function createOpenCodeApi(client: SdkLike, logger: Logger): OpenCodeApi {
  return {
    async replyPermission(input) {
      const result = await client.permission.reply({
        requestID: input.requestID,
        reply: input.reply,
        directory: input.directory,
      })
      if (result?.error) logger.warn(`permission.reply failed for ${input.requestID}`, result.error)
    },
    async replyQuestion(input) {
      const result = await client.question.reply({
        requestID: input.requestID,
        answers: input.answers,
        directory: input.directory,
      })
      if (result?.error) logger.warn(`question.reply failed for ${input.requestID}`, result.error)
    },
    async rejectQuestion(input) {
      const result = await client.question.reject({
        requestID: input.requestID,
        directory: input.directory,
      })
      if (result?.error) logger.warn(`question.reject failed for ${input.requestID}`, result.error)
    },
    async getSessionInfo(sessionID, directory) {
      const result = await client.session.get({ sessionID, directory })
      if (result?.error) return undefined
      return { title: result?.data?.title, parentID: result?.data?.parentID }
    },
    async listSessionMessages(sessionID, directory) {
      const result = await client.session.messages({ sessionID, directory })
      if (result?.error) return []
      return result?.data ?? []
    },
    async sendSessionPrompt(sessionID, text, directory) {
      const result = await client.session.prompt({
        sessionID,
        directory,
        parts: [{ type: "text", text }],
      })
      if (result?.error) {
        logger.warn(`session.prompt failed for ${sessionID}`, result.error)
        return false
      }
      return true
    },
  }
}
