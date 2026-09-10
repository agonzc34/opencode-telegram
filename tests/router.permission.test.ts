import { describe, it, expect } from "vitest"
import { makeRouter } from "./helpers.js"

describe("Router permissions", () => {
  it("sends a card and stores the pending permission", async () => {
    const { router, store, sent } = makeRouter()
    await router.handlePermissionAsked({
      id: "p1",
      sessionID: "s1",
      permission: "bash",
      patterns: ["git push"],
      always: ["git push"],
    })
    expect(sent).toHaveLength(1)
    expect(sent[0]?.text).toContain("Action: bash")
    const pending = store.get("p1")
    expect(pending?.kind).toBe("permission")
    expect(pending?.messageId).toBe(100)
  })

  it("replies once and edits the card on a callback", async () => {
    const { router, store, edits, answers, permissions } = makeRouter()
    await router.handlePermissionAsked({
      id: "p1",
      sessionID: "s1",
      permission: "bash",
      patterns: ["git push"],
      always: [],
    })
    await router.handleCallback({ id: "cb1", data: "p:p1:once" })
    expect(permissions).toEqual([{ requestID: "p1", reply: "once", directory: "/proj" }])
    expect(store.get("p1")).toBeUndefined()
    expect(edits[0]?.text).toContain("Allowed once")
    expect(answers[0]?.text).toContain("Allowed once")
  })

  it("supports always and reject", async () => {
    const a = makeRouter()
    await a.router.handlePermissionAsked({
      id: "p1",
      sessionID: "s1",
      permission: "edit",
      patterns: ["a"],
      always: ["a"],
    })
    await a.router.handleCallback({ id: "cb", data: "p:p1:always" })
    expect(a.permissions[0]?.reply).toBe("always")

    const b = makeRouter()
    await b.router.handlePermissionAsked({
      id: "p2",
      sessionID: "s1",
      permission: "edit",
      patterns: ["a"],
      always: [],
    })
    await b.router.handleCallback({ id: "cb", data: "p:p2:reject" })
    expect(b.permissions[0]?.reply).toBe("reject")
  })

  it("marks the card as answered elsewhere when replied externally", async () => {
    const { router, edits } = makeRouter()
    await router.handlePermissionAsked({
      id: "p1",
      sessionID: "s1",
      permission: "bash",
      patterns: [],
      always: [],
    })
    await router.handlePermissionReplied("p1")
    expect(edits[0]?.text).toContain("Answered in TUI")
  })

  it("replies to a permission callback even without local state (restart resilience)", async () => {
    const { router, answers, permissions } = makeRouter()
    await router.handleCallback({ id: "cb", data: "p:missing:once" })
    expect(permissions).toEqual([{ requestID: "missing", reply: "once", directory: "/proj" }])
    expect(answers).toHaveLength(1)
  })
})
