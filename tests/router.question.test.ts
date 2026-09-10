import { describe, it, expect } from "vitest"
import { makeRouter } from "./helpers.js"

const QUESTION = {
  id: "q1",
  sessionID: "s1",
  questions: [
    {
      question: "Which editor?",
      header: "Editor",
      options: [
        { label: "vim", description: "modal" },
        { label: "emacs", description: "extensible" },
      ],
    },
  ],
}

describe("Router questions", () => {
  it("sends a card and answers a single-select question", async () => {
    const { router, questions, edits } = makeRouter()
    await router.handleQuestionAsked(QUESTION)
    await router.handleCallback({ id: "cb", data: "q:q1:0:o1" })
    expect(questions).toEqual([{ requestID: "q1", answers: [["emacs"]], directory: "/proj" }])
    expect(edits.at(-1)?.text).toContain("emacs")
  })

  it("collects multi-select answers then submits", async () => {
    const { router, questions, edits } = makeRouter()
    await router.handleQuestionAsked({
      id: "q2",
      sessionID: "s1",
      questions: [
        {
          question: "Pick",
          header: "Pick",
          multiple: true,
          options: [
            { label: "a", description: "" },
            { label: "b", description: "" },
          ],
        },
      ],
    })
    await router.handleCallback({ id: "c1", data: "q:q2:0:o0" })
    await router.handleCallback({ id: "c2", data: "q:q2:0:o1" })
    await router.handleCallback({ id: "c3", data: "q:q2:0:o0" }) // toggle a off
    await router.handleCallback({ id: "c4", data: "q:q2:0:submit" })
    expect(questions).toEqual([{ requestID: "q2", answers: [["b"]], directory: "/proj" }])
    expect(edits.length).toBeGreaterThan(0)
  })

  it("skips a question with an empty answer", async () => {
    const { router, questions } = makeRouter()
    await router.handleQuestionAsked(QUESTION)
    await router.handleCallback({ id: "cb", data: "q:q1:0:skip" })
    expect(questions).toEqual([{ requestID: "q1", answers: [[]], directory: "/proj" }])
  })

  it("advances across multiple questions", async () => {
    const { router, questions, edits } = makeRouter()
    await router.handleQuestionAsked({
      id: "q3",
      sessionID: "s1",
      questions: [
        { question: "First?", header: "1", options: [{ label: "yes", description: "" }] },
        { question: "Second?", header: "2", options: [{ label: "no", description: "" }] },
      ],
    })
    await router.handleCallback({ id: "c1", data: "q:q3:0:o0" })
    expect(edits.at(-1)?.text).toContain("2/2")
    await router.handleCallback({ id: "c2", data: "q:q3:1:o0" })
    expect(questions).toEqual([{ requestID: "q3", answers: [["yes"], ["no"]], directory: "/proj" }])
  })

  it("rejects on cancel", async () => {
    const { router, rejects, edits } = makeRouter()
    await router.handleQuestionAsked(QUESTION)
    await router.handleCallback({ id: "cb", data: "q:q1:0:cancel" })
    expect(rejects).toEqual([{ requestID: "q1", directory: "/proj" }])
    expect(edits.at(-1)?.text).toContain("Cancelled")
  })

  it("captures a custom typed answer", async () => {
    const { router, questions, edits } = makeRouter()
    await router.handleQuestionAsked({
      id: "q4",
      sessionID: "s1",
      questions: [
        {
          question: "Name?",
          header: "Name",
          custom: true,
          options: [{ label: "x", description: "" }],
        },
      ],
    })
    await router.handleCallback({ id: "c1", data: "q:q4:0:custom" })
    expect(edits.at(-1)?.text).toContain("Send your answer")
    const consumed = await router.handleText("c1", "  Ada Lovelace  ")
    expect(consumed).toBe(true)
    expect(questions).toEqual([{ requestID: "q4", answers: [["Ada Lovelace"]], directory: "/proj" }])
  })

  it("does not consume text when nothing is awaiting", async () => {
    const { router } = makeRouter()
    expect(await router.handleText("c1", "hello")).toBe(false)
  })

  it("marks the card answered elsewhere when closed externally", async () => {
    const { router, edits } = makeRouter()
    await router.handleQuestionAsked(QUESTION)
    await router.handleQuestionClosed("q1")
    expect(edits.at(-1)?.text).toContain("Answered in TUI")
  })
})
