import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"))

describe("package.json", () => {
  it("declares no lifecycle scripts that trigger git dep preparation", () => {
    // opencode bundles npm/pacote. When a plugin is installed from a git URL,
    // pacote runs `npm install` inside the clone ("git dep preparation") if the
    // manifest declares any of these scripts (or `workspaces`). That preparation
    // fails under opencode's bundled runtime and aborts the plugin install, so we
    // must not use those script names. `dist/` is committed, so no build runs on
    // install. Use `bun run bundle` to regenerate `dist/`.
    const gitPrepareTriggers = ["postinstall", "build", "preinstall", "install", "prepack", "prepare"]
    const declared = gitPrepareTriggers.filter((name) => pkg.scripts?.[name])
    expect(declared).toEqual([])
    expect(pkg.workspaces).toBeUndefined()
  })
})
