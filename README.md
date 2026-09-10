# opencode-telegram

OpenCode plugin: get Telegram notifications when OpenCode needs input, and answer
permissions and questions from Telegram. The TUI and Telegram both show the
prompt; whichever is answered first wins.

## Install (local)

1. Install dependencies:

   ```
   bun install
   ```

2. Create `~/.config/opencode/plugin/telegram.ts`:

   ```ts
   export { TelegramPlugin } from "/path/to/opencode-telegram/src/index.ts"
   ```

3. Ensure `~/.config/opencode/telegram.env` contains:

   ```
   TELEGRAM_BOT_TOKEN=...
   TELEGRAM_CHAT_ID=...
   ```

4. Restart OpenCode.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | — | required |
| `TELEGRAM_CHAT_ID` | — | required; also the auth allow-list |
| `TELEGRAM_ALLOWED_USER_ID` | = chat id | optional extra user check |
| `TELEGRAM_OPENCODE_ENABLED` | `true` | kill switch |
| `TELEGRAM_MAX_MESSAGE_CHARS` | `3500` | truncate long fields |
| `TELEGRAM_LOG_LEVEL` | `info` | `debug`/`info`/`warn`/`error` |
| `TELEGRAM_COMPLETION_ENABLED` | `true` | turn-end snippet + reply |
| `TELEGRAM_COMPLETION_SENTENCES` | `2` | trailing sentences to send |

Settings can also be passed as plugin options in `opencode.json`; options win
over environment variables.

## Behavior

- **Permissions** — `✅ Allow once` / `♾️ Always` / `❌ Reject`.
- **Questions** — one question at a time; single/multi-select, free-text
  (`✏️ Type answer`), `⏭ Skip`, `⏹ Cancel`.
- **Plan review** — rendered as `📋 Plan review` with Yes/No.
- **Turn-end snippet** — when a turn ends and the assistant's final text contains
  a question, the session name and its last two sentences are sent to Telegram.
  Reply to that message and your text is sent as a prompt to that session.
- Requests stay pending until answered; nothing is auto-denied.
- Only the first OpenCode instance to acquire
  `~/.local/state/opencode-telegram/bot.lock` polls Telegram.

## Development

```
bun run typecheck
bun run test
bun run build
```
