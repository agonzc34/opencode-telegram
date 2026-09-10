import { closeSync, mkdirSync, openSync, readFileSync, unlinkSync, writeSync } from "node:fs"
import { dirname } from "node:path"

export type LockHandle = { release(): void }

function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM"
  }
}

export function acquireLock(path: string): LockHandle | null {
  mkdirSync(dirname(path), { recursive: true })

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = openSync(path, "wx")
      writeSync(fd, String(process.pid))
      closeSync(fd)
      return {
        release() {
          try {
            unlinkSync(path)
          } catch {
            /* ignore */
          }
        },
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error
      let pid = 0
      try {
        pid = Number.parseInt(readFileSync(path, "utf8"), 10)
      } catch {
        /* ignore */
      }
      if (Number.isFinite(pid) && pid > 0 && processAlive(pid)) return null
      try {
        unlinkSync(path)
      } catch {
        /* ignore */
      }
    }
  }

  return null
}
