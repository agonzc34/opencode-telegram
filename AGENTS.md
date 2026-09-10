# AGENTS.md

OpenCode plugin (`opencode-telegram`): forwards permission/question/plan-review prompts to Telegram and answers from there. Runs **inside the OpenCode server process**; there is no standalone dev server or entrypoint to run directly.

## Commands

```
bun install
bun run typecheck      # tsc --noEmit
bun run test           # vitest run
bun run build          # bun build src/index.ts -> dist/, externalizes @opencode-ai/plugin
```

- Single test: `bunx vitest run tests/render.test.ts` (or add `-t "name"`).
- There is **no lint script, formatter, or CI**.
- After code changes run `bun run typecheck && bun run test`.

## Hard constraints

- Local imports use `.js` extensions even though the files are `.ts` (e.g. `./config.js` in `src/index.ts`). This is required for ESM resolution; do not "fix" it.
- Tests must not touch the network or Telegram API. Use the fakes in `tests/helpers.ts` (`fakeTransport`, `fakeApi`, `makeRouter`). Suite is fast and fully unit-level.
- `dist/` is gitignored and committed source of truth is `src/` only. `bun run build` is the only build step.

## Configuration

- Reads `~/.config/opencode/telegram.env` (override with `OPENCODE_TELEGRAM_ENV`), then `process.env`, then plugin options; **plugin options win** per key. Sources merge in `src/config.ts:loadSettings`.
- The repo's `.env` / `.env.example` are documentation only — `.env` is **not** loaded.
- Required: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`. Missing values log and return `{}` (plugin disabled, OpenCode unaffected). `TELEGRAM_CHAT_ID` doubles as the auth allow-list.

## Architecture

- `src/index.ts` — `TelegramPlugin` entry; resolves config, acquires lock, starts grammy bot, returns hooks.
- `src/plugin.ts` — OpenCode event hook mapping (`permission.asked/replied`, `question.asked/replied/rejected`, `tool.execute.before` for `plan_exit`).
- `src/telegram/router.ts` — orchestrates all flows; depends on `TelegramTransport` + `OpenCodeApi` interfaces so tests can inject fakes.
- `src/telegram/bot.ts` — grammy bot/handlers; `src/telegram/render.ts` — card text + inline keyboards; `src/callbacks.ts` — callback-data encode/decode; `src/state.ts` — in-memory pending-request store; `src/opencode.ts` — SDK wrapper.
- Callback data format: `p:<requestID>:<once|always|reject>` and `q:<requestID>:<qIndex>:<optIndex|submit|custom|skip|cancel>`. Must stay under Telegram's 64-byte limit.
- Plan review is a normal question detected via the `plan_exit` tool `callID` (from `tool.execute.before`) or the `header === "Build Agent"` heuristic (`src/telegram/router.ts:57`).

## Runtime quirks

- Single-instance lock at `~/.local/state/opencode-telegram/bot.lock`: only the first OpenCode process polls Telegram; others get a no-op transport. Relevant when reproducing "notifications stopped" — check for a stale lock/other instance.
- Dev activation is a thin re-export at `~/.config/opencode/plugin/telegram.ts` pointing to `src/index.ts` (Bun loads TS directly); switch to `dist/index.js` after building. See README.
- `@opencode-ai/plugin` is a peer dep and is externalized from the build.

## References

- `docs/superpowers/specs/2026-09-10-telegram-opencode-plugin-design.md` — verified OpenCode SDK event/reply shapes and UX spec.
- `docs/superpowers/plans/2026-09-10-telegram-opencode-plugin.md` — implementation plan.
