import { describe, it, expect } from "vitest"
import { createLogger } from "../src/logger.js"

function collector(): { lines: string[]; sink: (line: string) => void } {
  const lines: string[] = []
  return { lines, sink: (line) => lines.push(line) }
}

describe("createLogger", () => {
  it("filters out messages below the configured level", () => {
    const { lines, sink } = collector()
    const logger = createLogger("warn", sink)
    logger.debug("d")
    logger.info("i")
    logger.warn("w")
    logger.error("e")
    expect(lines).toHaveLength(2)
    expect(lines[0]).toContain("warn")
    expect(lines[1]).toContain("error")
  })

  it("prefixes every line", () => {
    const { lines, sink } = collector()
    createLogger("debug", sink).info("hello")
    expect(lines[0]).toContain("[telegram-opencode]")
    expect(lines[0]).toContain("hello")
  })

  it("does not emit anywhere when no sink is provided", () => {
    const logger = createLogger("debug")
    expect(() => logger.info("silent")).not.toThrow()
  })
})
