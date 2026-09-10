import { describe, it, expect } from "vitest"
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { acquireLock } from "../src/lock.js"

function tempLockPath(): string {
  const dir = mkdtempSync(join(tmpdir(), "tglock-"))
  return join(dir, "bot.lock")
}

describe("acquireLock", () => {
  it("acquires and releases a fresh lock", () => {
    const path = tempLockPath()
    const lock = acquireLock(path)
    expect(lock).not.toBeNull()
    expect(readFileSync(path, "utf8")).toBe(String(process.pid))
    lock?.release()
  })

  it("refuses when a live process holds the lock", () => {
    const path = tempLockPath()
    const first = acquireLock(path)
    expect(first).not.toBeNull()
    const second = acquireLock(path)
    expect(second).toBeNull()
    first?.release()
  })

  it("allows re-acquiring after release", () => {
    const path = tempLockPath()
    acquireLock(path)?.release()
    expect(acquireLock(path)).not.toBeNull()
  })

  it("reclaims a stale lock whose pid is dead", () => {
    const path = tempLockPath()
    writeFileSync(path, "999999")
    const lock = acquireLock(path)
    expect(lock).not.toBeNull()
    lock?.release()
  })
})
