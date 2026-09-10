import { describe, it, expect } from "vitest"
import { buildHooks } from "../src/plugin.js"
import { Router } from "../src/telegram/router.js"
import { PendingStore } from "../src/state.js"
import { createLogger } from "../src/logger.js"
import { makeRouter } from "./helpers.js"

function hooksWith() {
  const { transport, sent } = makeRouter()
  const router = new Router({
    settings: {
      botToken: "t",
      chatId: "c1",
      enabled: true,
      maxMessageChars: 3500,
      logLevel: "error",
    },
    store: new PendingStore(),
    transport,
    api: {
      async replyPermission() {},
      async replyQuestion() {},
      async rejectQuestion() {},
      async getSessionTitle() {
        return undefined
      },
    },
    logger: createLogger("error"),
    directory: "/proj",
    projectName: "proj",
    isPlanExitCall: () => false,
  })
  const planExitCalls = new Set<string>()
  const hooks = buildHooks(router, planExitCalls)
  return { hooks, sent, planExitCalls }
}

describe("buildHooks", () => {
  it("routes permission.asked events to the router", async () => {
    const { hooks, sent } = hooksWith()
    await hooks.event?.({
      event: {
        type: "permission.asked",
        properties: { id: "p1", sessionID: "s1", permission: "bash", patterns: ["x"], always: [] },
      } as any,
    })
    expect(sent).toHaveLength(1)
  })

  it("routes question.asked and question.replied events", async () => {
    const { hooks, sent } = hooksWith()
    await hooks.event?.({
      event: {
        type: "question.asked",
        properties: {
          id: "q1",
          sessionID: "s1",
          questions: [{ question: "Q", header: "H", options: [{ label: "a", description: "" }] }],
        },
      } as any,
    })
    expect(sent).toHaveLength(1)
    await expect(
      hooks.event?.({ event: { type: "question.replied", properties: { requestID: "q1" } } as any }),
    ).resolves.toBeUndefined()
  })

  it("records plan_exit call ids from tool.execute.before", async () => {
    const { hooks, planExitCalls } = hooksWith()
    await hooks["tool.execute.before"]?.(
      { tool: "plan_exit", sessionID: "s1", callID: "c9" },
      { args: {} },
    )
    expect(planExitCalls.has("c9")).toBe(true)
  })
})
