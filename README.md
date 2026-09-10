# opencode-telegram

OpenCode plugin: get Telegram notifications when OpenCode needs input, and answer
permissions and questions from Telegram. The TUI and Telegram both show the
prompt; whichever is answered first wins.

## Features

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
- Logs go to `~/.local/state/opencode-telegram/plugin.log` (never to the TUI).

## Requirements

- OpenCode (the plugin runs inside the OpenCode server process).
- A Telegram bot: create one with [@BotFather](https://t.me/BotFather) and copy
  its token.
- Your numeric Telegram user/chat id: message
  [@userinfobot](https://t.me/userinfobot).

## Install

Add the plugin to `~/.config/opencode/opencode.json` (or a project
`opencode.json`):

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-telegram@git+https://github.com/agonzc34/opencode-telegram.git"]
}
```

OpenCode installs plugins and their dependencies with Bun at startup. Restart
OpenCode after adding or changing the entry.

## Configuration

Provide the bot token and chat id either as plugin options (recommended):

```json
{
  "plugin": [
    [
      "opencode-telegram@git+https://github.com/agonzc34/opencode-telegram.git",
      { "botToken": "123456:ABC...", "chatId": "123456789" }
    ]
  ]
}
```

or via environment variables (for example in
`~/.config/opencode/telegram.env`, in the process environment, or in
`~/.config/opencode/opencode.json` `environment`):

```
TELEGRAM_BOT_TOKEN=123456:ABC...
TELEGRAM_CHAT_ID=123456789
```

Plugin options win over environment variables.

| Option / variable | Default | Purpose |
|---|---|---|
| `botToken` / `TELEGRAM_BOT_TOKEN` | — | required |
| `chatId` / `TELEGRAM_CHAT_ID` | — | required; also the auth allow-list |
| `allowedUserId` / `TELEGRAM_ALLOWED_USER_ID` | = chat id | optional extra user check |
| `enabled` / `TELEGRAM_OPENCODE_ENABLED` | `true` | kill switch |
| `maxMessageChars` / `TELEGRAM_MAX_MESSAGE_CHARS` | `3500` | truncate long fields |
| `logLevel` / `TELEGRAM_LOG_LEVEL` | `info` | `debug`/`info`/`warn`/`error` |
| `completionEnabled` / `TELEGRAM_COMPLETION_ENABLED` | `true` | turn-end snippet + reply |
| `completionSentences` / `TELEGRAM_COMPLETION_SENTENCES` | `2` | trailing sentences to send |

> If you already use another Telegram notifier for permissions/questions, disable
> its Telegram message to avoid duplicates.

## Security

Only messages from `chatId` (and `allowedUserId` when set) are processed. Keep
your bot token secret.

## Development

```
bun install
bun run typecheck
bun run test
bun run bundle
```

`dist/index.js` is committed so git installs work without a build step — run
`bun run bundle` and commit the result before pushing changes to `src/`.

To try local changes without pushing, point an
`~/.config/opencode/plugin/telegram.ts` file at the source:

```ts
export { TelegramPlugin } from "/absolute/path/to/opencode-telegram/src/index.ts"
```

## License

MIT
