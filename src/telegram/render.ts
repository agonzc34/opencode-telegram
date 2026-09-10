import {
  encodePermission,
  encodeQuestionControl,
  encodeQuestionOption,
} from "../callbacks.js"
import type { PendingQuestion } from "../state.js"
import type { InlineButton } from "../types.js"

export type RenderedCard = { text: string; buttons: InlineButton[][] }

export function truncate(value: string, max: number): string {
  if (value.length <= max) return value
  return `${value.slice(0, Math.max(0, max - 1))}…`
}

export function permissionCard(input: {
  permission: string
  patterns: string[]
  always: string[]
  project?: string
  session?: string
  requestId: string
  maxChars: number
}): RenderedCard {
  const lines = ["🔐 Permission required", "", `Action: ${input.permission}`]
  if (input.patterns.length > 0) {
    lines.push(`Pattern: ${truncate(input.patterns.join(", "), input.maxChars)}`)
  }
  if (input.project) lines.push(`Project: ${truncate(input.project, 120)}`)
  if (input.session) lines.push(`Session: ${truncate(input.session, 120)}`)

  const firstRow: InlineButton[] = [
    { text: "✅ Allow once", callback_data: encodePermission(input.requestId, "once") },
  ]
  if (input.always.length > 0) {
    firstRow.push({ text: "♾️ Always", callback_data: encodePermission(input.requestId, "always") })
  }
  const buttons: InlineButton[][] = [
    firstRow,
    [{ text: "❌ Reject", callback_data: encodePermission(input.requestId, "reject") }],
  ]
  return { text: lines.join("\n"), buttons }
}

function titleFor(pending: PendingQuestion): string {
  return pending.planReview ? "📋 Plan review" : "❓ Question"
}

function answerFor(pending: PendingQuestion, index: number): string {
  const custom = pending.customAnswers.get(index)
  if (custom && custom.length > 0) return custom
  const selected = pending.selections.get(index)
  const question = pending.questions[index]
  if (!selected || !question || selected.size === 0) return ""
  return [...selected]
    .sort((a, b) => a - b)
    .map((optionIndex) => question.options[optionIndex]?.label ?? "")
    .filter((label) => label.length > 0)
    .join(", ")
}

export function buildAnswers(pending: PendingQuestion): string[][] {
  return pending.questions.map((question, index) => {
    const custom = pending.customAnswers.get(index)
    if (custom && custom.length > 0) return [custom]
    const selected = pending.selections.get(index)
    if (!selected || selected.size === 0) return []
    return [...selected]
      .sort((a, b) => a - b)
      .map((optionIndex) => question.options[optionIndex]?.label ?? "")
      .filter((label) => label.length > 0)
  })
}

export function questionCard(
  pending: PendingQuestion,
  maxChars: number,
  session?: string,
): RenderedCard {
  const question = pending.questions[pending.currentIndex]
  if (!question) return { text: titleFor(pending), buttons: [] }

  const progress =
    pending.questions.length > 1 ? ` ${pending.currentIndex + 1}/${pending.questions.length}` : ""
  const header = question.header ? ` — ${question.header}` : ""
  const sessionLine = session ? `${truncate(session, 120)}\n` : ""
  let text = `${sessionLine}${titleFor(pending)}${progress}${header}\n\n${truncate(question.question, maxChars)}`
  if (question.multiple) text += "\n\nSelect one or more, then Submit."
  if (pending.awaitingCustomFor === pending.currentIndex) {
    text += "\n\n✏️ Send your answer as a text message."
  }

  const buttons: InlineButton[][] = []
  question.options.forEach((option, optionIndex) => {
    const selected = pending.selections.get(pending.currentIndex)?.has(optionIndex)
    const prefix = question.multiple ? (selected ? "✅ " : "▫️ ") : ""
    buttons.push([
      {
        text: truncate(`${prefix}${option.label}`, 60),
        callback_data: encodeQuestionOption(pending.requestId, pending.currentIndex, optionIndex),
      },
    ])
  })
  if (question.multiple) {
    buttons.push([
      {
        text: "✔ Submit",
        callback_data: encodeQuestionControl(pending.requestId, pending.currentIndex, "submit"),
      },
    ])
  }
  if (question.custom) {
    buttons.push([
      {
        text: "✏️ Type answer",
        callback_data: encodeQuestionControl(pending.requestId, pending.currentIndex, "custom"),
      },
    ])
  }
  buttons.push([
    {
      text: "⏭ Skip",
      callback_data: encodeQuestionControl(pending.requestId, pending.currentIndex, "skip"),
    },
    {
      text: "⏹ Cancel",
      callback_data: encodeQuestionControl(pending.requestId, pending.currentIndex, "cancel"),
    },
  ])

  return { text, buttons }
}

export function questionSummaryText(pending: PendingQuestion): string {
  const title = pending.planReview ? "📋 Plan review — ✅ Submitted" : "❓ Question — ✅ Answered"
  const lines = [title]
  pending.questions.forEach((question, index) => {
    const answer = answerFor(pending, index)
    lines.push("", question.header || question.question, answer || "(skipped)")
  })
  return lines.join("\n")
}

export function questionResolvedText(pending: PendingQuestion, status: string): string {
  return `${titleFor(pending)} — ${status}`
}

export function questionAwaitingText(
  pending: PendingQuestion,
  qIndex: number,
  maxChars: number,
): string {
  const question = pending.questions[qIndex]
  return `${titleFor(pending)}\n\n✏️ Send your answer as a text message.\n\n${truncate(
    question?.question ?? "",
    maxChars,
  )}`
}

export function permissionResolvedText(status: string): string {
  return `🔐 Permission — ${status}`
}
