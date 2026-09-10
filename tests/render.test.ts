import { describe, it, expect } from "vitest"
import {
  permissionCard,
  questionCard,
  questionSummaryText,
  questionResolvedText,
  questionAwaitingText,
  permissionResolvedText,
  buildAnswers,
} from "../src/telegram/render.js"
import type { PendingQuestion } from "../src/state.js"

const ID = "01JREQUESTID0000000000000000"

function pending(overrides: Partial<PendingQuestion> = {}): PendingQuestion {
  return {
    kind: "question",
    requestId: ID,
    sessionID: "s1",
    chatId: "c1",
    messageId: 5,
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
    currentIndex: 0,
    selections: new Map(),
    customAnswers: new Map(),
    awaitingCustomFor: null,
    planReview: false,
    ...overrides,
  }
}

describe("permissionCard", () => {
  it("includes action, pattern and service buttons", () => {
    const card = permissionCard({
      permission: "bash",
      patterns: ["git push"],
      always: ["git push"],
      project: "proj",
      session: "sess",
      requestId: ID,
      maxChars: 3500,
    })
    expect(card.text).toContain("🔐 Permission required")
    expect(card.text).toContain("Action: bash")
    expect(card.text).toContain("Pattern: git push")
    expect(card.text).toContain("Session: sess")
    const flat = card.buttons.flat().map((b) => b.callback_data)
    expect(flat).toContain(`p:${ID}:once`)
    expect(flat).toContain(`p:${ID}:always`)
    expect(flat).toContain(`p:${ID}:reject`)
  })

  it("hides the Always button when there are no always patterns", () => {
    const card = permissionCard({
      permission: "edit",
      patterns: ["a.ts"],
      always: [],
      requestId: ID,
      maxChars: 3500,
    })
    const flat = card.buttons.flat().map((b) => b.callback_data)
    expect(flat).not.toContain(`p:${ID}:always`)
  })
})

describe("questionCard", () => {
  it("renders options and controls for a single-select question", () => {
    const card = questionCard(pending(), 3500)
    expect(card.text).toContain("❓ Question")
    expect(card.text).toContain("Editor")
    expect(card.text).toContain("Which editor?")
    const flat = card.buttons.flat().map((b) => b.callback_data)
    expect(flat).toContain(`q:${ID}:0:o0`)
    expect(flat).toContain(`q:${ID}:0:o1`)
    expect(flat).toContain(`q:${ID}:0:skip`)
    expect(flat).toContain(`q:${ID}:0:cancel`)
    expect(flat).not.toContain(`q:${ID}:0:submit`)
  })

  it("shows submit for multi-select and custom when allowed", () => {
    const p = pending({
      questions: [
        {
          question: "Pick many",
          header: "Many",
          multiple: true,
          custom: true,
          options: [{ label: "a", description: "" }],
        },
      ],
    })
    const flat = questionCard(p, 3500).buttons.flat().map((b) => b.callback_data)
    expect(flat).toContain(`q:${ID}:0:submit`)
    expect(flat).toContain(`q:${ID}:0:custom`)
  })

  it("shows the Type answer button when custom is omitted (defaults to true)", () => {
    const flat = questionCard(pending(), 3500).buttons.flat().map((b) => b.callback_data)
    expect(flat).toContain(`q:${ID}:0:custom`)
  })

  it("hides the Type answer button when custom is explicitly false", () => {
    const p = pending({
      questions: [
        {
          question: "No free text",
          header: "Fixed",
          custom: false,
          options: [{ label: "a", description: "" }],
        },
      ],
    })
    const flat = questionCard(p, 3500).buttons.flat().map((b) => b.callback_data)
    expect(flat).not.toContain(`q:${ID}:0:custom`)
  })

  it("uses the plan-review title", () => {
    const card = questionCard(pending({ planReview: true }), 3500)
    expect(card.text).toContain("📋 Plan review")
  })

  it("puts the session name at the top of the message", () => {
    const card = questionCard(pending(), 3500, "My Session")
    expect(card.text.startsWith("My Session")).toBe(true)
    expect(card.text.indexOf("My Session")).toBeLessThan(card.text.indexOf("❓"))
  })
})

describe("buildAnswers", () => {
  it("maps selected option indices to labels and uses custom text first", () => {
    const p = pending({
      questions: [
        {
          question: "q1",
          header: "h",
          options: [
            { label: "A", description: "" },
            { label: "B", description: "" },
          ],
          multiple: true,
        },
        { question: "q2", header: "h", options: [{ label: "C", description: "" }], custom: true },
        { question: "q3", header: "h", options: [{ label: "D", description: "" }] },
      ],
    })
    p.selections.set(0, new Set([1, 0]))
    p.customAnswers.set(1, "typed")
    const answers = buildAnswers(p)
    expect(answers[0]).toEqual(["A", "B"])
    expect(answers[1]).toEqual(["typed"])
    expect(answers[2]).toEqual([])
  })
})

describe("summary text", () => {
  it("lists answers", () => {
    const p = pending({ planReview: true })
    p.selections.set(0, new Set([0]))
    const text = questionSummaryText(p)
    expect(text).toContain("📋 Plan review")
    expect(text).toContain("vim")
  })

  it("has a generic resolved and awaiting text", () => {
    expect(questionResolvedText(pending(), "⤷ Answered in TUI")).toContain("Answered in TUI")
    expect(questionAwaitingText(pending(), 0, 3500)).toContain("Send your answer")
    expect(permissionResolvedText("✅ Allowed once")).toContain("✅ Allowed once")
  })
})
