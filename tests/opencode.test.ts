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
        return { data: { title: "My Session", parentID: undefined } }
      },
      messages: async (input: any) => {
        calls.push(`session.messages:${input.sessionID}`)
        return { data: [{ info: { id: "a1", role: "assistant" }, parts: [{ type: "text", text: "hi?" }] }] }
      },
      prompt: async (input: any) => {
        calls.push(`session.prompt:${input.sessionID}:${input.parts[0].text}`)
        return { data: true }
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

  it("returns the session info", async () => {
    const { client } = fakeClient()
    const api = createOpenCodeApi(client, createLogger("error"))
    expect(await api.getSessionInfo("s1", "/proj")).toEqual({ title: "My Session", parentID: undefined })
  })

  it("lists session messages", async () => {
    const { client } = fakeClient()
    const api = createOpenCodeApi(client, createLogger("error"))
    expect(await api.listSessionMessages("s1", "/proj")).toHaveLength(1)
  })

  it("sends a session prompt", async () => {
    const { client, calls } = fakeClient()
    const api = createOpenCodeApi(client, createLogger("error"))
    expect(await api.sendSessionPrompt("s1", "continue", "/proj")).toBe(true)
    expect(calls).toContain("session.prompt:s1:continue")
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
      session: {
        get: async () => ({ error: { _tag: "NotFound" } }),
        messages: async () => ({ error: { _tag: "NotFound" } }),
        prompt: async () => ({ error: { _tag: "NotFound" } }),
      },
    }
    const api = createOpenCodeApi(client, logger)
    await expect(api.replyPermission({ requestID: "r1", reply: "reject" })).resolves.toBeUndefined()
    expect(await api.sendSessionPrompt("s1", "hi")).toBe(false)
    expect(await api.getSessionInfo("s1")).toBeUndefined()
    expect(warn).toHaveBeenCalled()
  })
})
