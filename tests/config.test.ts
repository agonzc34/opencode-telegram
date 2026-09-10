import { describe, it, expect } from "vitest"
import { parseEnv, resolveSettings } from "../src/config.js"

describe("parseEnv", () => {
  it("parses keys, ignores comments/blanks, strips quotes", () => {
    const parsed = parseEnv(
      [
        "# comment",
        "",
        "TELEGRAM_BOT_TOKEN=abc:123",
        'TELEGRAM_CHAT_ID="42"',
        "TELEGRAM_LOG_LEVEL='debug'",
      ].join("\n"),
    )
    expect(parsed).toEqual({
      TELEGRAM_BOT_TOKEN: "abc:123",
      TELEGRAM_CHAT_ID: "42",
      TELEGRAM_LOG_LEVEL: "debug",
    })
  })
})

describe("resolveSettings", () => {
  it("errors when token is missing", () => {
    const result = resolveSettings([{}, {}])
    expect(result.ok).toBe(false)
  })

  it("errors when chat id is missing", () => {
    const result = resolveSettings([{ TELEGRAM_BOT_TOKEN: "t" }])
    expect(result.ok).toBe(false)
  })

  it("applies later sources as overrides", () => {
    const result = resolveSettings([
      { TELEGRAM_BOT_TOKEN: "file", TELEGRAM_CHAT_ID: "1" },
      { TELEGRAM_BOT_TOKEN: "env" },
    ])
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.settings.botToken).toBe("env")
  })

  it("defaults enabled=true, maxMessageChars=3500, logLevel=info", () => {
    const result = resolveSettings([{ TELEGRAM_BOT_TOKEN: "t", TELEGRAM_CHAT_ID: "1" }])
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.settings.enabled).toBe(true)
      expect(result.settings.maxMessageChars).toBe(3500)
      expect(result.settings.logLevel).toBe("info")
      expect(result.settings.allowedUserId).toBeUndefined()
    }
  })

  it("parses enabled=false and custom numeric/level values", () => {
    const result = resolveSettings([
      {
        TELEGRAM_BOT_TOKEN: "t",
        TELEGRAM_CHAT_ID: "1",
        TELEGRAM_OPENCODE_ENABLED: "false",
        TELEGRAM_MAX_MESSAGE_CHARS: "999",
        TELEGRAM_LOG_LEVEL: "debug",
        TELEGRAM_ALLOWED_USER_ID: "7",
      },
    ])
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.settings.enabled).toBe(false)
      expect(result.settings.maxMessageChars).toBe(999)
      expect(result.settings.logLevel).toBe("debug")
      expect(result.settings.allowedUserId).toBe("7")
    }
  })

  it("falls back to info level for an unknown level", () => {
    const result = resolveSettings([
      { TELEGRAM_BOT_TOKEN: "t", TELEGRAM_CHAT_ID: "1", TELEGRAM_LOG_LEVEL: "nope" },
    ])
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.settings.logLevel).toBe("info")
  })
})
