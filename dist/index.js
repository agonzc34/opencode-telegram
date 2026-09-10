// src/index.ts
import { createOpencodeClient as createV2Client } from "@opencode-ai/sdk/v2";
import { basename, join as join3 } from "node:path";
import { homedir as homedir3 } from "node:os";

// src/config.ts
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
var DEFAULT_ENV_PATH = join(homedir(), ".config/opencode/telegram.env");
var LOG_LEVELS = ["debug", "info", "warn", "error"];
function parseEnv(text) {
  const out = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#"))
      continue;
    const eq = line.indexOf("=");
    if (eq === -1)
      continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    const quoted = value.startsWith('"') && value.endsWith('"') || value.startsWith("'") && value.endsWith("'");
    if (quoted && value.length >= 2)
      value = value.slice(1, -1);
    out[key] = value;
  }
  return out;
}
function resolveSettings(sources) {
  const merged = {};
  for (const source of sources) {
    for (const [key, value] of Object.entries(source)) {
      if (value !== undefined)
        merged[key] = value;
    }
  }
  const botToken = merged.TELEGRAM_BOT_TOKEN?.trim();
  if (!botToken)
    return { ok: false, reason: "TELEGRAM_BOT_TOKEN is missing" };
  const chatId = merged.TELEGRAM_CHAT_ID?.trim();
  if (!chatId)
    return { ok: false, reason: "TELEGRAM_CHAT_ID is missing" };
  const enabledRaw = (merged.TELEGRAM_OPENCODE_ENABLED ?? "true").trim().toLowerCase();
  const enabled = !["false", "0", "no", "off"].includes(enabledRaw);
  const levelRaw = (merged.TELEGRAM_LOG_LEVEL ?? "info").trim().toLowerCase();
  const logLevel = LOG_LEVELS.includes(levelRaw) ? levelRaw : "info";
  const maxRaw = Number.parseInt(merged.TELEGRAM_MAX_MESSAGE_CHARS ?? "", 10);
  const maxMessageChars = Number.isFinite(maxRaw) && maxRaw > 0 ? maxRaw : 3500;
  const completionRaw = (merged.TELEGRAM_COMPLETION_ENABLED ?? "true").trim().toLowerCase();
  const completionEnabled = !["false", "0", "no", "off"].includes(completionRaw);
  const sentencesRaw = Number.parseInt(merged.TELEGRAM_COMPLETION_SENTENCES ?? "", 10);
  const completionSentences = Number.isFinite(sentencesRaw) && sentencesRaw > 0 ? sentencesRaw : 2;
  return {
    ok: true,
    settings: {
      botToken,
      chatId,
      allowedUserId: merged.TELEGRAM_ALLOWED_USER_ID?.trim() || undefined,
      enabled,
      maxMessageChars,
      logLevel,
      completionEnabled,
      completionSentences
    }
  };
}
function loadSettings(envPath = process.env.OPENCODE_TELEGRAM_ENV || DEFAULT_ENV_PATH, options = {}) {
  let fileVars = {};
  if (existsSync(envPath)) {
    try {
      fileVars = parseEnv(readFileSync(envPath, "utf8"));
    } catch {
      return { ok: false, reason: `cannot read ${envPath}` };
    }
  }
  const optionVars = {
    TELEGRAM_BOT_TOKEN: options.botToken,
    TELEGRAM_CHAT_ID: options.chatId,
    TELEGRAM_ALLOWED_USER_ID: options.allowedUserId,
    TELEGRAM_OPENCODE_ENABLED: options.enabled === undefined ? undefined : String(options.enabled),
    TELEGRAM_MAX_MESSAGE_CHARS: options.maxMessageChars === undefined ? undefined : String(options.maxMessageChars),
    TELEGRAM_LOG_LEVEL: options.logLevel,
    TELEGRAM_COMPLETION_ENABLED: options.completionEnabled === undefined ? undefined : String(options.completionEnabled),
    TELEGRAM_COMPLETION_SENTENCES: options.completionSentences === undefined ? undefined : String(options.completionSentences)
  };
  return resolveSettings([fileVars, process.env, optionVars]);
}

// src/lock.ts
import { closeSync, mkdirSync, openSync, readFileSync as readFileSync2, unlinkSync, writeSync } from "node:fs";
import { dirname } from "node:path";
function processAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}
function acquireLock(path) {
  mkdirSync(dirname(path), { recursive: true });
  for (let attempt = 0;attempt < 2; attempt++) {
    try {
      const fd = openSync(path, "wx");
      writeSync(fd, String(process.pid));
      closeSync(fd);
      return {
        release() {
          try {
            unlinkSync(path);
          } catch {}
        }
      };
    } catch (error) {
      if (error.code !== "EEXIST")
        throw error;
      let pid = 0;
      try {
        pid = Number.parseInt(readFileSync2(path, "utf8"), 10);
      } catch {}
      if (Number.isFinite(pid) && pid > 0 && processAlive(pid))
        return null;
      try {
        unlinkSync(path);
      } catch {}
    }
  }
  return null;
}

// src/logger.ts
import { appendFileSync, mkdirSync as mkdirSync2 } from "node:fs";
import { homedir as homedir2 } from "node:os";
import { dirname as dirname2, join as join2 } from "node:path";
var ORDER = { debug: 0, info: 1, warn: 2, error: 3 };
var DEFAULT_LOG_PATH = join2(homedir2(), ".local/state/opencode-telegram/plugin.log");
function createFileSink(path = DEFAULT_LOG_PATH) {
  let directoryReady = false;
  return (line) => {
    try {
      if (!directoryReady) {
        mkdirSync2(dirname2(path), { recursive: true });
        directoryReady = true;
      }
      appendFileSync(path, `${line}
`);
    } catch {}
  };
}
function formatArg(value) {
  if (typeof value === "string")
    return value;
  if (value instanceof Error)
    return value.stack ?? value.message;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
function createLogger(level, sink) {
  const min = ORDER[level];
  const emit = (l, args) => {
    if (ORDER[l] < min || !sink)
      return;
    sink(`[telegram-opencode] ${l}: ${args.map(formatArg).join(" ")}`);
  };
  return {
    debug: (...args) => emit("debug", args),
    info: (...args) => emit("info", args),
    warn: (...args) => emit("warn", args),
    error: (...args) => emit("error", args)
  };
}

// src/opencode.ts
function createOpenCodeApi(client, logger) {
  return {
    async replyPermission(input) {
      const result = await client.permission.reply({
        requestID: input.requestID,
        reply: input.reply,
        directory: input.directory
      });
      if (result?.error)
        logger.warn(`permission.reply failed for ${input.requestID}`, result.error);
    },
    async replyQuestion(input) {
      const result = await client.question.reply({
        requestID: input.requestID,
        answers: input.answers,
        directory: input.directory
      });
      if (result?.error)
        logger.warn(`question.reply failed for ${input.requestID}`, result.error);
    },
    async rejectQuestion(input) {
      const result = await client.question.reject({
        requestID: input.requestID,
        directory: input.directory
      });
      if (result?.error)
        logger.warn(`question.reject failed for ${input.requestID}`, result.error);
    },
    async getSessionInfo(sessionID, directory) {
      const result = await client.session.get({ sessionID, directory });
      if (result?.error)
        return;
      return { title: result?.data?.title, parentID: result?.data?.parentID };
    },
    async listSessionMessages(sessionID, directory) {
      const result = await client.session.messages({ sessionID, directory });
      if (result?.error)
        return [];
      return result?.data ?? [];
    },
    async sendSessionPrompt(sessionID, text, directory) {
      const result = await client.session.prompt({
        sessionID,
        directory,
        parts: [{ type: "text", text }]
      });
      if (result?.error) {
        logger.warn(`session.prompt failed for ${sessionID}`, result.error);
        return false;
      }
      return true;
    }
  };
}

// src/state.ts
class PendingStore {
  byRequest = new Map;
  awaitingCustomByChat = new Map;
  addPermission(pending) {
    this.byRequest.set(pending.requestId, pending);
  }
  addQuestion(pending) {
    this.byRequest.set(pending.requestId, pending);
  }
  get(requestId) {
    return this.byRequest.get(requestId);
  }
  setMessageId(requestId, messageId) {
    const pending = this.byRequest.get(requestId);
    if (pending)
      pending.messageId = messageId;
  }
  remove(requestId) {
    const pending = this.byRequest.get(requestId);
    if (!pending)
      return;
    this.byRequest.delete(requestId);
    if (pending.kind === "question" && pending.awaitingCustomFor !== null) {
      this.clearAwaitingCustom(pending.chatId);
    }
    return pending;
  }
  setAwaitingCustom(chatId, requestId, qIndex) {
    const pending = this.byRequest.get(requestId);
    if (!pending || pending.kind !== "question")
      return;
    pending.awaitingCustomFor = qIndex;
    this.awaitingCustomByChat.set(chatId, requestId);
  }
  clearAwaitingCustom(chatId) {
    const requestId = this.awaitingCustomByChat.get(chatId);
    this.awaitingCustomByChat.delete(chatId);
    if (!requestId)
      return;
    const pending = this.byRequest.get(requestId);
    if (pending && pending.kind === "question")
      pending.awaitingCustomFor = null;
  }
  getAwaitingCustom(chatId) {
    const requestId = this.awaitingCustomByChat.get(chatId);
    if (!requestId)
      return;
    const pending = this.byRequest.get(requestId);
    return pending && pending.kind === "question" ? pending : undefined;
  }
  values() {
    return [...this.byRequest.values()];
  }
}

// src/plugin.ts
function buildHooks(router, planExitCalls) {
  return {
    event: async ({ event }) => {
      const e = event;
      switch (e.type) {
        case "permission.asked":
          await router.handlePermissionAsked(e.properties);
          break;
        case "permission.replied":
          await router.handlePermissionReplied(e.properties.requestID);
          break;
        case "question.asked":
          await router.handleQuestionAsked(e.properties);
          break;
        case "question.replied":
        case "question.rejected":
          await router.handleQuestionClosed(e.properties.requestID);
          break;
        case "session.idle":
          await router.handleSessionIdle(e.properties.sessionID);
          break;
        default:
          break;
      }
    },
    "tool.execute.before": async (input) => {
      if (input.tool === "plan_exit")
        planExitCalls.add(input.callID);
    }
  };
}

// src/telegram/bot.ts
import { Bot } from "grammy";
function createGrammyBot(token) {
  return new Bot(token);
}
function createGrammyTransport(bot) {
  return {
    async sendCard(chatId, text, buttons) {
      const message = await bot.api.sendMessage(chatId, text, {
        reply_markup: buttons ? { inline_keyboard: buttons } : undefined
      });
      return message.message_id;
    },
    async editCard(chatId, messageId, text, buttons) {
      await bot.api.editMessageText(chatId, messageId, text, {
        reply_markup: { inline_keyboard: buttons ?? [] }
      });
    },
    async answerCallback(id, text) {
      await bot.api.answerCallbackQuery(id, text ? { text } : undefined);
    }
  };
}
function isAuthorized(settings, userId) {
  if (!settings.allowedUserId)
    return true;
  if (userId === undefined)
    return false;
  return String(userId) === settings.allowedUserId;
}
function registerHandlers(bot, router, settings, logger) {
  bot.on("callback_query:data", async (ctx) => {
    const chatId = ctx.chat?.id;
    if (String(chatId) !== settings.chatId || !isAuthorized(settings, ctx.from?.id)) {
      await ctx.answerCallbackQuery().catch(() => {
        return;
      });
      return;
    }
    try {
      await router.handleCallback({ id: ctx.callbackQuery.id, data: ctx.callbackQuery.data });
    } catch (error) {
      logger.error("callback handler failed", error);
    }
  });
  bot.on("message:text", async (ctx) => {
    if (String(ctx.chat.id) !== settings.chatId || !isAuthorized(settings, ctx.from?.id))
      return;
    try {
      const result = await router.handleText(String(ctx.chat.id), ctx.message.text);
      if (result.deleteMessage)
        await ctx.deleteMessage().catch(() => {
          return;
        });
    } catch (error) {
      logger.error("text handler failed", error);
    }
  });
}
function startBot(bot, router, settings, logger) {
  registerHandlers(bot, router, settings, logger);
  bot.start({ allowed_updates: ["message", "callback_query"] }).catch((error) => logger.error("telegram bot polling stopped", error));
}
function stopBot(bot) {
  bot.stop().catch(() => {
    return;
  });
}

// src/callbacks.ts
function encodePermission(requestId, decision) {
  return `p:${requestId}:${decision}`;
}
function encodeQuestionOption(requestId, qIndex, optIndex) {
  return `q:${requestId}:${qIndex}:o${optIndex}`;
}
function encodeQuestionControl(requestId, qIndex, control) {
  return `q:${requestId}:${qIndex}:${control}`;
}
function parseIndex(raw) {
  if (!/^\d+$/.test(raw))
    return null;
  return Number.parseInt(raw, 10);
}
function decodeCallback(data) {
  const parts = data.split(":");
  if (parts.length === 3 && parts[0] === "p") {
    const [, requestId, decision] = parts;
    if (!requestId)
      return null;
    if (decision === "once" || decision === "always" || decision === "reject") {
      return { kind: "permission", requestId, decision };
    }
    return null;
  }
  if (parts.length === 4 && parts[0] === "q") {
    const [, requestId, qRaw, tail] = parts;
    if (!requestId || !tail)
      return null;
    const qIndex = parseIndex(qRaw);
    if (qIndex === null)
      return null;
    if (tail.startsWith("o")) {
      const optIndex = parseIndex(tail.slice(1));
      if (optIndex === null)
        return null;
      return { kind: "question-option", requestId, qIndex, optIndex };
    }
    if (tail === "submit" || tail === "custom" || tail === "skip" || tail === "cancel") {
      return { kind: "question-control", requestId, qIndex, control: tail };
    }
  }
  return null;
}

// src/snippet.ts
function lastAssistantText(messages) {
  for (let index = messages.length - 1;index >= 0; index--) {
    const message = messages[index];
    if (!message || message.info.role !== "assistant")
      continue;
    const text = message.parts.filter((part) => part.type === "text" && typeof part.text === "string").map((part) => part.text ?? "").join(`
`).trim();
    if (text.length > 0)
      return { messageID: message.info.id, text };
  }
  return;
}
function looksLikeQuestion(text) {
  return text.includes("?");
}
function extractTrailingSentences(text, count) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized)
    return "";
  const sentences = normalized.match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g);
  if (!sentences)
    return normalized;
  const cleaned = sentences.map((sentence) => sentence.trim()).filter((sentence) => sentence.length > 0);
  return cleaned.slice(-Math.max(1, count)).join(" ");
}

// src/telegram/render.ts
function truncate(value, max) {
  if (value.length <= max)
    return value;
  return `${value.slice(0, Math.max(0, max - 1))}…`;
}
function permissionCard(input) {
  const lines = ["\uD83D\uDD10 Permission required", "", `Action: ${input.permission}`];
  if (input.patterns.length > 0) {
    lines.push(`Pattern: ${truncate(input.patterns.join(", "), input.maxChars)}`);
  }
  if (input.project)
    lines.push(`Project: ${truncate(input.project, 120)}`);
  if (input.session)
    lines.push(`Session: ${truncate(input.session, 120)}`);
  const firstRow = [
    { text: "✅ Allow once", callback_data: encodePermission(input.requestId, "once") }
  ];
  if (input.always.length > 0) {
    firstRow.push({ text: "♾️ Always", callback_data: encodePermission(input.requestId, "always") });
  }
  const buttons = [
    firstRow,
    [{ text: "❌ Reject", callback_data: encodePermission(input.requestId, "reject") }]
  ];
  return { text: lines.join(`
`), buttons };
}
function titleFor(pending) {
  return pending.planReview ? "\uD83D\uDCCB Plan review" : "❓ Question";
}
function answerFor(pending, index) {
  const custom = pending.customAnswers.get(index);
  if (custom && custom.length > 0)
    return custom;
  const selected = pending.selections.get(index);
  const question = pending.questions[index];
  if (!selected || !question || selected.size === 0)
    return "";
  return [...selected].sort((a, b) => a - b).map((optionIndex) => question.options[optionIndex]?.label ?? "").filter((label) => label.length > 0).join(", ");
}
function buildAnswers(pending) {
  return pending.questions.map((question, index) => {
    const custom = pending.customAnswers.get(index);
    if (custom && custom.length > 0)
      return [custom];
    const selected = pending.selections.get(index);
    if (!selected || selected.size === 0)
      return [];
    return [...selected].sort((a, b) => a - b).map((optionIndex) => question.options[optionIndex]?.label ?? "").filter((label) => label.length > 0);
  });
}
function questionCard(pending, maxChars, session) {
  const question = pending.questions[pending.currentIndex];
  if (!question)
    return { text: titleFor(pending), buttons: [] };
  const progress = pending.questions.length > 1 ? ` ${pending.currentIndex + 1}/${pending.questions.length}` : "";
  const header = question.header ? ` — ${question.header}` : "";
  const sessionLine = session ? `${truncate(session, 120)}
` : "";
  let text = `${sessionLine}${titleFor(pending)}${progress}${header}

${truncate(question.question, maxChars)}`;
  if (question.multiple)
    text += `

Select one or more, then Submit.`;
  if (pending.awaitingCustomFor === pending.currentIndex) {
    text += `

✏️ Send your answer as a text message.`;
  }
  const buttons = [];
  question.options.forEach((option, optionIndex) => {
    const selected = pending.selections.get(pending.currentIndex)?.has(optionIndex);
    const prefix = question.multiple ? selected ? "✅ " : "▫️ " : "";
    buttons.push([
      {
        text: truncate(`${prefix}${option.label}`, 60),
        callback_data: encodeQuestionOption(pending.requestId, pending.currentIndex, optionIndex)
      }
    ]);
  });
  if (question.multiple) {
    buttons.push([
      {
        text: "✔ Submit",
        callback_data: encodeQuestionControl(pending.requestId, pending.currentIndex, "submit")
      }
    ]);
  }
  if (question.custom !== false) {
    buttons.push([
      {
        text: "✏️ Type answer",
        callback_data: encodeQuestionControl(pending.requestId, pending.currentIndex, "custom")
      }
    ]);
  }
  buttons.push([
    {
      text: "⏭ Skip",
      callback_data: encodeQuestionControl(pending.requestId, pending.currentIndex, "skip")
    },
    {
      text: "⏹ Cancel",
      callback_data: encodeQuestionControl(pending.requestId, pending.currentIndex, "cancel")
    }
  ]);
  return { text, buttons };
}
function questionSummaryText(pending) {
  const title = pending.planReview ? "\uD83D\uDCCB Plan review — ✅ Submitted" : "❓ Question — ✅ Answered";
  const lines = [title];
  pending.questions.forEach((question, index) => {
    const answer = answerFor(pending, index);
    lines.push("", question.header || question.question, answer || "(skipped)");
  });
  return lines.join(`
`);
}
function questionResolvedText(pending, status) {
  return `${titleFor(pending)} — ${status}`;
}
function questionAwaitingText(pending, qIndex, maxChars) {
  const question = pending.questions[qIndex];
  return `${titleFor(pending)}

✏️ Send your answer as a text message.

${truncate(question?.question ?? "", maxChars)}`;
}
function permissionResolvedText(status) {
  return `\uD83D\uDD10 Permission — ${status}`;
}

// src/telegram/router.ts
function decisionLabel(decision) {
  if (decision === "once")
    return "✅ Allowed once";
  if (decision === "always")
    return "✅ Always allowed";
  return "❌ Rejected";
}
function decisionToast(decision) {
  if (decision === "once")
    return "Allowed once";
  if (decision === "always")
    return "Always allowed";
  return "Rejected";
}
async function safeAnswer(transport, id, text) {
  try {
    await transport.answerCallback(id, text);
  } catch {}
}
function looksLikePlanReview(questions) {
  return questions.length === 1 && questions[0]?.header === "Build Agent";
}

class Router {
  deps;
  activeSessionByChat = new Map;
  activeMessageByChat = new Map;
  lastNotifiedBySession = new Map;
  constructor(deps) {
    this.deps = deps;
  }
  async sessionLabel(sessionID) {
    try {
      const info = await this.deps.api.getSessionInfo(sessionID, this.deps.directory);
      return info?.title;
    } catch {
      return;
    }
  }
  async handlePermissionAsked(request) {
    const { settings, store, transport, logger } = this.deps;
    const session = await this.sessionLabel(request.sessionID);
    const card = permissionCard({
      permission: request.permission,
      patterns: request.patterns,
      always: request.always,
      project: this.deps.projectName,
      session,
      requestId: request.id,
      maxChars: settings.maxMessageChars
    });
    try {
      const messageId = await transport.sendCard(settings.chatId, card.text, card.buttons);
      const pending = {
        kind: "permission",
        requestId: request.id,
        sessionID: request.sessionID,
        directory: this.deps.directory,
        chatId: settings.chatId,
        messageId
      };
      store.addPermission(pending);
    } catch (error) {
      logger.error("failed to send permission card", error);
    }
  }
  async handlePermissionReplied(requestId) {
    const { store, transport, logger } = this.deps;
    const pending = store.remove(requestId);
    if (!pending || pending.kind !== "permission")
      return;
    try {
      await transport.editCard(pending.chatId, pending.messageId, permissionResolvedText("⤷ Answered in TUI"));
    } catch (error) {
      logger.debug("failed to edit permission card", error);
    }
  }
  async handleQuestionAsked(request) {
    const { settings, store, transport, logger } = this.deps;
    const session = await this.sessionLabel(request.sessionID);
    const planReview = request.tool ? this.deps.isPlanExitCall(request.tool.callID) || looksLikePlanReview(request.questions) : looksLikePlanReview(request.questions);
    const pending = {
      kind: "question",
      requestId: request.id,
      sessionID: request.sessionID,
      directory: this.deps.directory,
      chatId: settings.chatId,
      messageId: 0,
      questions: request.questions,
      currentIndex: 0,
      selections: new Map,
      customAnswers: new Map,
      awaitingCustomFor: null,
      planReview
    };
    store.addQuestion(pending);
    try {
      const card = questionCard(pending, settings.maxMessageChars, session);
      const messageId = await transport.sendCard(settings.chatId, card.text, card.buttons);
      store.setMessageId(request.id, messageId);
    } catch (error) {
      logger.error("failed to send question card", error);
      store.remove(request.id);
    }
  }
  async handleQuestionClosed(requestId) {
    const { store, transport, logger } = this.deps;
    const pending = store.remove(requestId);
    if (!pending || pending.kind !== "question")
      return;
    try {
      await transport.editCard(pending.chatId, pending.messageId, questionResolvedText(pending, "⤷ Answered in TUI"));
    } catch (error) {
      logger.debug("failed to edit question card", error);
    }
  }
  async handleCallback(query) {
    const { store, transport, api, logger, directory } = this.deps;
    const decoded = decodeCallback(query.data);
    if (!decoded) {
      await safeAnswer(transport, query.id);
      return;
    }
    try {
      if (decoded.kind === "permission") {
        const pending = store.get(decoded.requestId);
        await api.replyPermission({
          requestID: decoded.requestId,
          reply: decoded.decision,
          directory
        });
        store.remove(decoded.requestId);
        if (pending && pending.kind === "permission") {
          await transport.editCard(pending.chatId, pending.messageId, permissionResolvedText(decisionLabel(decoded.decision)));
        }
        await safeAnswer(transport, query.id, decisionToast(decoded.decision));
        return;
      }
      const pending = store.get(decoded.requestId);
      if (!pending || pending.kind !== "question") {
        await safeAnswer(transport, query.id, "This request is no longer active.");
        return;
      }
      if (decoded.kind === "question-option") {
        await this.applyOption(pending, decoded.qIndex, decoded.optIndex, query.id);
      } else {
        await this.applyControl(pending, decoded, query.id);
      }
    } catch (error) {
      logger.error("callback handling failed", error);
      await safeAnswer(transport, query.id, "Something went wrong.");
    }
  }
  async applyOption(pending, qIndex, optIndex, queryId) {
    const { transport } = this.deps;
    const question = pending.questions[qIndex];
    if (!question || !question.options[optIndex]) {
      await safeAnswer(transport, queryId);
      return;
    }
    if (question.multiple) {
      const selected = pending.selections.get(qIndex) ?? new Set;
      if (selected.has(optIndex))
        selected.delete(optIndex);
      else
        selected.add(optIndex);
      pending.selections.set(qIndex, selected);
      await this.editQuestionCard(pending);
      await safeAnswer(transport, queryId);
      return;
    }
    pending.selections.set(qIndex, new Set([optIndex]));
    await safeAnswer(transport, queryId);
    await this.advance(pending);
  }
  async applyControl(pending, decoded, queryId) {
    const { store, transport, api, logger, directory } = this.deps;
    logger.info(`question control: ${decoded.control}`, pending.requestId);
    if (decoded.control === "cancel") {
      await api.rejectQuestion({ requestID: pending.requestId, directory });
      store.remove(pending.requestId);
      await transport.editCard(pending.chatId, pending.messageId, questionResolvedText(pending, "⏹ Cancelled"));
      await safeAnswer(transport, queryId, "Cancelled");
      return;
    }
    if (decoded.control === "custom") {
      store.setAwaitingCustom(pending.chatId, pending.requestId, decoded.qIndex);
      await transport.editCard(pending.chatId, pending.messageId, questionAwaitingText(pending, decoded.qIndex, this.deps.settings.maxMessageChars));
      await safeAnswer(transport, queryId, "Send your answer as a text message");
      return;
    }
    if (decoded.control === "skip")
      pending.selections.set(decoded.qIndex, new Set);
    await safeAnswer(transport, queryId);
    await this.advance(pending);
  }
  async advance(pending) {
    if (pending.currentIndex < pending.questions.length - 1) {
      pending.currentIndex += 1;
      await this.editQuestionCard(pending);
      return;
    }
    await this.finalize(pending);
  }
  async editQuestionCard(pending) {
    const { settings, transport, logger } = this.deps;
    try {
      const session = await this.sessionLabel(pending.sessionID);
      const card = questionCard(pending, settings.maxMessageChars, session);
      await transport.editCard(pending.chatId, pending.messageId, card.text, card.buttons);
    } catch (error) {
      logger.debug("failed to edit question card", error);
    }
  }
  async finalize(pending) {
    const { store, transport, api, logger, directory } = this.deps;
    const answers = buildAnswers(pending);
    await api.replyQuestion({ requestID: pending.requestId, answers, directory });
    store.remove(pending.requestId);
    await transport.editCard(pending.chatId, pending.messageId, questionSummaryText(pending));
    logger.info("question answered", pending.requestId);
  }
  async handleSessionIdle(sessionID) {
    const { settings, transport, api, logger } = this.deps;
    if (!settings.completionEnabled)
      return;
    try {
      const info = await api.getSessionInfo(sessionID, this.deps.directory);
      if (info?.parentID)
        return;
      const messages = await api.listSessionMessages(sessionID, this.deps.directory);
      const last = lastAssistantText(messages);
      if (!last || !looksLikeQuestion(last.text))
        return;
      if (this.lastNotifiedBySession.get(sessionID) === last.messageID)
        return;
      const snippet = extractTrailingSentences(last.text, settings.completionSentences);
      const header = info?.title ? `${truncate(info.title, 120)}
` : "";
      const body = `${header}${snippet}

↩️ Reply here to continue this session.`;
      const messageId = await transport.sendCard(settings.chatId, body);
      this.lastNotifiedBySession.set(sessionID, last.messageID);
      this.activeSessionByChat.set(settings.chatId, sessionID);
      this.activeMessageByChat.set(settings.chatId, messageId);
    } catch (error) {
      logger.error("failed to send completion snippet", error);
    }
  }
  async handleText(chatId, text) {
    const { store, transport, api, logger } = this.deps;
    const pending = store.getAwaitingCustom(chatId);
    if (pending) {
      const qIndex = pending.awaitingCustomFor;
      if (qIndex === null)
        return { handled: false, deleteMessage: false };
      pending.customAnswers.set(qIndex, text.trim());
      pending.selections.set(qIndex, new Set);
      store.clearAwaitingCustom(chatId);
      await this.advance(pending);
      return { handled: true, deleteMessage: true };
    }
    const sessionID = this.activeSessionByChat.get(chatId);
    const trimmed = text.trim();
    if (!sessionID || trimmed.length === 0)
      return { handled: false, deleteMessage: false };
    const sent = await api.sendSessionPrompt(sessionID, trimmed, this.deps.directory);
    this.activeSessionByChat.delete(chatId);
    const messageId = this.activeMessageByChat.get(chatId);
    this.activeMessageByChat.delete(chatId);
    if (sent && messageId !== undefined) {
      try {
        await transport.editCard(chatId, messageId, "⏺ Sent to session");
      } catch (error) {
        logger.debug("failed to edit completion card", error);
      }
    }
    return { handled: true, deleteMessage: false };
  }
}

// src/index.ts
var LOCK_PATH = join3(homedir3(), ".local/state/opencode-telegram/bot.lock");
var NOOP_TRANSPORT = {
  async sendCard() {
    return 0;
  },
  async editCard() {},
  async answerCallback() {}
};
function createV2FromInput(input) {
  const injected = input.client;
  const config = injected?._client?.getConfig?.() ?? {};
  const headers = { ...config.headers ?? {} };
  delete headers["x-opencode-directory"];
  delete headers["content-type"];
  return createV2Client({
    baseUrl: config.baseUrl ?? input.serverUrl?.toString(),
    headers,
    directory: input.directory,
    ...config.fetch ? { fetch: config.fetch } : {}
  });
}
var TelegramPlugin = async (input, options) => {
  const shouldStartBot = options?.startBot !== false;
  const sink = createFileSink();
  const resolved = loadSettings(undefined, options ?? {});
  if (!resolved.ok) {
    createLogger("error", sink).error(`disabled: ${resolved.reason}`);
    return {};
  }
  const settings = resolved.settings;
  if (!settings.enabled) {
    createLogger("error", sink).error("disabled via TELEGRAM_OPENCODE_ENABLED");
    return {};
  }
  const logger = createLogger(settings.logLevel, sink);
  const store = new PendingStore;
  const api = createOpenCodeApi(createV2FromInput(input), logger);
  const directory = input.directory;
  const projectName = basename(input.worktree || input.directory);
  const planExitCalls = new Set;
  const lock = shouldStartBot ? acquireLock(LOCK_PATH) : null;
  let bot = null;
  let transport = NOOP_TRANSPORT;
  if (shouldStartBot) {
    if (!lock) {
      logger.warn("another opencode instance owns the telegram bot; notifications disabled here");
    } else {
      bot = createGrammyBot(settings.botToken);
      transport = createGrammyTransport(bot);
    }
  }
  const router = new Router({
    settings,
    store,
    transport,
    api,
    logger,
    directory,
    projectName,
    isPlanExitCall: (callID) => planExitCalls.has(callID)
  });
  if (bot) {
    startBot(bot, router, settings, logger);
    const release = lock?.release;
    const shutdown = () => {
      if (bot)
        stopBot(bot);
      release?.();
    };
    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
    logger.info("telegram bot started");
  }
  return buildHooks(router, planExitCalls);
};
var src_default = TelegramPlugin;
export {
  TelegramPlugin,
  src_default as default
};
