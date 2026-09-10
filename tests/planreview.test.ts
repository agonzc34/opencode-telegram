import { describe, it, expect } from "vitest"
import { makeRouter } from "./helpers.js"

const PLAN_EXIT_QUESTION = {
  id: "plan1",
  sessionID: "s1",
  questions: [
    {
      question:
        "Plan at /tmp/plan.md is complete. Would you like to switch to the build agent and start implementing?",
      header: "Build Agent",
      options: [
        { label: "Yes", description: "Switch to build agent" },
        { label: "No", description: "Stay with plan agent" },
      ],
    },
  ],
}

describe("plan review", () => {
  it("labels a plan_exit question as a plan review via header heuristic", async () => {
    const { router, sent } = makeRouter()
    await router.handleQuestionAsked(PLAN_EXIT_QUESTION)
    expect(sent[0]?.text).toContain("📋 Plan review")
  })

  it("answers a plan review with Yes", async () => {
    const { router, questions } = makeRouter()
    await router.handleQuestionAsked(PLAN_EXIT_QUESTION)
    await router.handleCallback({ id: "cb", data: "q:plan1:0:o0" })
    expect(questions[0]?.answers).toEqual([["Yes"]])
  })
})
