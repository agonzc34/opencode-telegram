import { describe, it, expect } from "vitest"
import { makeRouter } from "./helpers.js"
import type { MessageLike } from "../src/snippet.js"

function assistant(id: string, text: string): MessageLike {
  return { info: { id, role: "assistant" }, parts: [{ type: "text", text }] }
}

describe("Router completion snippet", () => {
  it("sends the last two sentences when the turn ends with a question", async () => {
    const { router, sent, setMessages } = makeRouter()
    setMessages([
      { info: { id: "u1", role: "user" }, parts: [{ type: "text", text: "do it" }] },
      assistant("a1", "I finished the refactor. Should I proceed with the tests?"),
    ])
    await router.handleSessionIdle("s1")
    expect(sent).toHaveLength(1)
    expect(sent[0]?.text).toContain("Should I proceed with the tests?")
    expect(sent[0]?.text).toContain("My Session")
    expect(sent[0]?.text).toContain("Reply here")
  })

  it("extracts only the configured number of sentences", async () => {
    const { router, sent, setMessages } = makeRouter({ completionSentences: 1 })
    setMessages([assistant("a1", "One. Two. Three?")])
    await router.handleSessionIdle("s1")
    expect(sent[0]?.text).toContain("Three?")
    expect(sent[0]?.text).not.toContain("Two.")
  })

  it("does not send when the last message has no question mark", async () => {
    const { router, sent, setMessages } = makeRouter()
    setMessages([assistant("a1", "All done.")])
    await router.handleSessionIdle("s1")
    expect(sent).toHaveLength(0)
  })

  it("skips child sessions", async () => {
    const { router, sent, setMessages, setSessionInfo } = makeRouter()
    setSessionInfo({ title: "child", parentID: "parent" })
    setMessages([assistant("a1", "Continue?")])
    await router.handleSessionIdle("s1")
    expect(sent).toHaveLength(0)
  })

  it("dedupes repeated idle events for the same message", async () => {
    const { router, sent, setMessages } = makeRouter()
    setMessages([assistant("a1", "Continue?")])
    await router.handleSessionIdle("s1")
    await router.handleSessionIdle("s1")
    expect(sent).toHaveLength(1)
  })

  it("sends a new snippet for a new assistant message", async () => {
    const { router, sent, setMessages } = makeRouter()
    setMessages([assistant("a1", "Continue?")])
    await router.handleSessionIdle("s1")
    setMessages([assistant("a1", "Continue?"), assistant("a2", "Now what?")])
    await router.handleSessionIdle("s1")
    expect(sent).toHaveLength(2)
    expect(sent[1]?.text).toContain("Now what?")
  })

  it("routes a reply to the last idle session as a prompt", async () => {
    const { router, prompts, edits, setMessages } = makeRouter()
    setMessages([assistant("a1", "Continue?")])
    await router.handleSessionIdle("s1")
    const result = await router.handleText("c1", "  yes please  ")
    expect(result.handled).toBe(true)
    expect(result.deleteMessage).toBe(false)
    expect(prompts).toEqual([{ sessionID: "s1", text: "yes please", directory: "/proj" }])
    expect(edits.at(-1)?.text).toContain("Sent to session")
  })

  it("only routes to the most recently notified session", async () => {
    const { router, prompts, setMessages } = makeRouter()
    setMessages([assistant("a1", "Continue?")])
    await router.handleSessionIdle("s1")
    // A different session finishes later and becomes the active target.
    setMessages([assistant("b1", "And now?")])
    // simulate idle for s2 by changing session info/title is not needed; call directly
    await router.handleSessionIdle("s2")
    await router.handleText("c1", "go")
    expect(prompts.at(-1)?.sessionID).toBe("s2")
  })

  it("does not send a prompt when no turn is awaiting", async () => {
    const { router, prompts } = makeRouter()
    const result = await router.handleText("c1", "hello")
    expect(result.handled).toBe(false)
    expect(prompts).toHaveLength(0)
  })

  it("does nothing when completion is disabled", async () => {
    const { router, sent, setMessages } = makeRouter({ completionEnabled: false })
    setMessages([assistant("a1", "Continue?")])
    await router.handleSessionIdle("s1")
    expect(sent).toHaveLength(0)
  })
})
