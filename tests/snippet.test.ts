import { describe, it, expect } from "vitest"
import {
  lastAssistantText,
  looksLikeQuestion,
  extractTrailingSentences,
  type MessageLike,
} from "../src/snippet.js"

function assistant(id: string, ...texts: string[]): MessageLike {
  return {
    info: { id, role: "assistant" },
    parts: texts.map((text) => ({ type: "text", text })),
  }
}

describe("lastAssistantText", () => {
  it("returns the last assistant message with text", () => {
    const messages: MessageLike[] = [
      { info: { id: "u1", role: "user" }, parts: [{ type: "text", text: "hi" }] },
      assistant("a1", "first"),
      assistant("a2", "second"),
      { info: { id: "u2", role: "user" }, parts: [{ type: "text", text: "again" }] },
    ]
    expect(lastAssistantText(messages)).toEqual({ messageID: "a2", text: "second" })
  })

  it("skips assistant messages with no text parts", () => {
    const messages: MessageLike[] = [
      assistant("a1", "real"),
      { info: { id: "a2", role: "assistant" }, parts: [{ type: "tool" }] },
    ]
    expect(lastAssistantText(messages)).toEqual({ messageID: "a1", text: "real" })
  })

  it("joins multiple text parts", () => {
    expect(lastAssistantText([assistant("a1", "line1", "line2")])?.text).toBe("line1\nline2")
  })

  it("returns undefined when there is no assistant text", () => {
    expect(lastAssistantText([{ info: { id: "u1", role: "user" }, parts: [] }])).toBeUndefined()
  })
})

describe("looksLikeQuestion", () => {
  it("detects a question mark", () => {
    expect(looksLikeQuestion("Should I continue?")).toBe(true)
    expect(looksLikeQuestion("Done.")).toBe(false)
  })
})

describe("extractTrailingSentences", () => {
  it("returns the last two sentences", () => {
    const text = "First sentence. Second sentence? Third sentence."
    expect(extractTrailingSentences(text, 2)).toBe("Second sentence? Third sentence.")
  })

  it("handles text without terminal punctuation", () => {
    expect(extractTrailingSentences("just one line", 2)).toBe("just one line")
  })

  it("collapses whitespace and newlines", () => {
    expect(extractTrailingSentences("a\n\nb?   c.", 2)).toBe("a b? c.")
  })

  it("returns everything when fewer sentences than requested", () => {
    expect(extractTrailingSentences("Only one?", 2)).toBe("Only one?")
  })
})
