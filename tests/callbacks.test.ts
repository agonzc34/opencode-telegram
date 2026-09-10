import { describe, it, expect } from "vitest"
import {
  encodePermission,
  encodeQuestionOption,
  encodeQuestionControl,
  decodeCallback,
} from "../src/callbacks.js"

const ID = "01JABCDEFGHJKMNPQRSTVWXYZ0A"

describe("callbacks", () => {
  it("round-trips a permission decision", () => {
    const data = encodePermission(ID, "always")
    expect(decodeCallback(data)).toEqual({ kind: "permission", requestId: ID, decision: "always" })
  })

  it("round-trips a question option", () => {
    const data = encodeQuestionOption(ID, 1, 3)
    expect(decodeCallback(data)).toEqual({
      kind: "question-option",
      requestId: ID,
      qIndex: 1,
      optIndex: 3,
    })
  })

  it("round-trips every question control", () => {
    for (const control of ["submit", "custom", "skip", "cancel"] as const) {
      expect(decodeCallback(encodeQuestionControl(ID, 0, control))).toEqual({
        kind: "question-control",
        requestId: ID,
        qIndex: 0,
        control,
      })
    }
  })

  it("keeps callback data within Telegram's 64-byte limit", () => {
    expect(encodePermission(ID, "once").length).toBeLessThanOrEqual(64)
    expect(encodeQuestionOption(ID, 9, 9).length).toBeLessThanOrEqual(64)
    expect(encodeQuestionControl(ID, 9, "cancel").length).toBeLessThanOrEqual(64)
  })

  it("returns null for malformed data", () => {
    expect(decodeCallback("")).toBeNull()
    expect(decodeCallback("x:1:2")).toBeNull()
    expect(decodeCallback(`p:${ID}:maybe`)).toBeNull()
    expect(decodeCallback(`q:${ID}:notanumber:o0`)).toBeNull()
    expect(decodeCallback(`q:${ID}:0:notacontrol`)).toBeNull()
  })
})
