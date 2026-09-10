import type { Hooks } from "@opencode-ai/plugin"
import type { Router } from "./telegram/router.js"

type OpenCodeEvent = {
  type: string
  properties: any
}

export function buildHooks(router: Router, planExitCalls: Set<string>): Hooks {
  return {
    event: async ({ event }) => {
      const e = event as unknown as OpenCodeEvent
      switch (e.type) {
        case "permission.asked":
          await router.handlePermissionAsked(e.properties)
          break
        case "permission.replied":
          await router.handlePermissionReplied(e.properties.requestID)
          break
        case "question.asked":
          await router.handleQuestionAsked(e.properties)
          break
        case "question.replied":
        case "question.rejected":
          await router.handleQuestionClosed(e.properties.requestID)
          break
        case "session.idle":
          await router.handleSessionIdle(e.properties.sessionID)
          break
        default:
          break
      }
    },
    "tool.execute.before": async (input) => {
      if (input.tool === "plan_exit") planExitCalls.add(input.callID)
    },
  }
}
