import { describe, it, expect, vi } from "vitest"
import { createOpenCodeApi, type SdkLike } from "../src/opencode.js"
import { createLogger } from "../src/logger.js"

function fakeClient(): { client: SdkLike; calls: string[] } {
  const calls: string[] = []
  const client = {
    permission: {
      reply: async (input: any) => {
        calls.push(`permission.reply:${input.requestID}:${input.reply}`)
        return { data: true }
      },
    },
    question: {
      reply: async (input: any) => {
        calls.push(`question.reply:${input.requestID}:${JSON.stringify(input.answers)}`)
        return { data: true }
      },
      reject: async (input: any) => {
        calls.push(`question.reject:${input.requestID}`)
        return { data: true }
      },
    },
    session: {
      get: async (input: any) => {
        calls.push(`session.get:${input.sessionID}`)
        return { data: { title: "My Session" } }
      },
    },
  } as unknown as SdkLike
  return { client, calls }
}

describe("createOpenCodeApi", () => {
  it("forwards permission replies with the directory", async () => {
    const { client, calls } = fakeClient()
    const api = createOpenCodeApi(client, createLogger("error"))
    await api.replyPermission({ requestID: "r1", reply: "once", directory: "/proj" })
    expect(calls).toEqual(["permission.reply:r1:once"])
  })

  it("forwards question answers and rejects", async () => {
    const { client, calls } = fakeClient()
    const api = createOpenCodeApi(client, createLogger("error"))
    await api.replyQuestion({ requestID: "r1", answers: [["Yes"]], directory: "/proj" })
    await api.rejectQuestion({ requestID: "r2", directory: "/proj" })
    expect(calls).toEqual(['question.reply:r1:[["Yes"]]', "question.reject:r2"])
  })

  it("returns the session title", async () => {
    const { client } = fakeClient()
    const api = createOpenCodeApi(client, createLogger("error"))
    expect(await api.getSessionTitle("s1", "/proj")).toBe("My Session")
  })

  it("logs but does not throw when the SDK returns an error", async () => {
    const logger = createLogger("debug")
    const warn = vi.spyOn(logger, "warn")
    const client: SdkLike = {
      permission: { reply: async () => ({ error: { _tag: "NotFound" } }) },
      question: {
        reply: async () => ({ error: { _tag: "NotFound" } }),
        reject: async () => ({ error: { _tag: "NotFound" } }),
      },
      session: { get: async () => ({ error: { _tag: "NotFound" } }) },
    }
    const api = createOpenCodeApi(client, logger)
    await expect(api.replyPermission({ requestID: "r1", reply: "reject" })).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalled()
  })
})
