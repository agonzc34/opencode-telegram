import type { Logger } from "./logger.js"

export type PermissionDecision = "once" | "always" | "reject"

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
  getSessionTitle(sessionID: string, directory?: string): Promise<string | undefined>
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
    get(input: { sessionID: string; directory?: string }): Promise<SdkResult<{ title?: string }>>
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
    async getSessionTitle(sessionID, directory) {
      const result = await client.session.get({ sessionID, directory })
      if (result?.error) return undefined
      return result?.data?.title
    },
  }
}
