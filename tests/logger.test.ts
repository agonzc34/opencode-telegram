import { describe, it, expect, vi, afterEach } from "vitest"
import { createLogger } from "../src/logger.js"

afterEach(() => vi.restoreAllMocks())

describe("createLogger", () => {
  it("filters out messages below the configured level", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    const logger = createLogger("warn")
    logger.debug("d")
    logger.info("i")
    logger.warn("w")
    logger.error("e")
    expect(spy).toHaveBeenCalledTimes(2)
    expect(spy.mock.calls[0]?.[0]).toContain("warn")
    expect(spy.mock.calls[1]?.[0]).toContain("error")
  })

  it("prefixes every line", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    createLogger("debug").info("hello")
    expect(spy.mock.calls[0]?.[0]).toContain("[telegram-opencode]")
    expect(spy.mock.calls[0]?.[1]).toBe("hello")
  })
})
