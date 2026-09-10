import { describe, it, expect } from "vitest"
import { PendingStore, type PendingQuestion } from "../src/state.js"

function question(overrides: Partial<PendingQuestion> = {}): PendingQuestion {
  return {
    kind: "question",
    requestId: "r1",
    sessionID: "s1",
    chatId: "c1",
    messageId: 0,
    questions: [
      { question: "Q?", header: "H", options: [{ label: "A", description: "" }] },
    ],
    currentIndex: 0,
    selections: new Map(),
    customAnswers: new Map(),
    awaitingCustomFor: null,
    planReview: false,
    ...overrides,
  }
}

describe("PendingStore", () => {
  it("stores, retrieves and removes requests", () => {
    const store = new PendingStore()
    store.addQuestion(question())
    expect(store.get("r1")?.kind).toBe("question")
    store.remove("r1")
    expect(store.get("r1")).toBeUndefined()
  })

  it("tracks the message id", () => {
    const store = new PendingStore()
    store.addQuestion(question())
    store.setMessageId("r1", 99)
    expect(store.get("r1")?.messageId).toBe(99)
  })

  it("tracks and clears custom-answer awaiting state", () => {
    const store = new PendingStore()
    store.addQuestion(question())
    store.setAwaitingCustom("c1", "r1", 0)
    expect(store.getAwaitingCustom("c1")?.requestId).toBe("r1")
    expect(store.getAwaitingCustom("c1")?.awaitingCustomFor).toBe(0)
    store.clearAwaitingCustom("c1")
    expect(store.getAwaitingCustom("c1")).toBeUndefined()
  })

  it("clears awaiting state when the request is removed", () => {
    const store = new PendingStore()
    store.addQuestion(question())
    store.setAwaitingCustom("c1", "r1", 0)
    store.remove("r1")
    expect(store.getAwaitingCustom("c1")).toBeUndefined()
  })
})
