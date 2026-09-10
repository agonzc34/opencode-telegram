export type PermissionDecision = "once" | "always" | "reject"
export type QuestionControl = "submit" | "custom" | "skip" | "cancel"

export type DecodedCallback =
  | { kind: "permission"; requestId: string; decision: PermissionDecision }
  | { kind: "question-option"; requestId: string; qIndex: number; optIndex: number }
  | { kind: "question-control"; requestId: string; qIndex: number; control: QuestionControl }

export function encodePermission(requestId: string, decision: PermissionDecision): string {
  return `p:${requestId}:${decision}`
}

export function encodeQuestionOption(requestId: string, qIndex: number, optIndex: number): string {
  return `q:${requestId}:${qIndex}:o${optIndex}`
}

export function encodeQuestionControl(
  requestId: string,
  qIndex: number,
  control: QuestionControl,
): string {
  return `q:${requestId}:${qIndex}:${control}`
}

function parseIndex(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null
  return Number.parseInt(raw, 10)
}

export function decodeCallback(data: string): DecodedCallback | null {
  const parts = data.split(":")

  if (parts.length === 3 && parts[0] === "p") {
    const [, requestId, decision] = parts
    if (!requestId) return null
    if (decision === "once" || decision === "always" || decision === "reject") {
      return { kind: "permission", requestId, decision }
    }
    return null
  }

  if (parts.length === 4 && parts[0] === "q") {
    const [, requestId, qRaw, tail] = parts
    if (!requestId || !tail) return null
    const qIndex = parseIndex(qRaw)
    if (qIndex === null) return null

    if (tail.startsWith("o")) {
      const optIndex = parseIndex(tail.slice(1))
      if (optIndex === null) return null
      return { kind: "question-option", requestId, qIndex, optIndex }
    }

    if (tail === "submit" || tail === "custom" || tail === "skip" || tail === "cancel") {
      return { kind: "question-control", requestId, qIndex, control: tail }
    }
  }

  return null
}
