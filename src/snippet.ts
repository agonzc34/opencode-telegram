export type PartLike = { type: string; text?: string }
export type MessageLike = { info: { id: string; role: string }; parts: PartLike[] }

export function lastAssistantText(
  messages: MessageLike[],
): { messageID: string; text: string } | undefined {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index]
    if (!message || message.info.role !== "assistant") continue
    const text = message.parts
      .filter((part) => part.type === "text" && typeof part.text === "string")
      .map((part) => part.text ?? "")
      .join("\n")
      .trim()
    if (text.length > 0) return { messageID: message.info.id, text }
  }
  return undefined
}

export function looksLikeQuestion(text: string): boolean {
  return text.includes("?")
}

export function extractTrailingSentences(text: string, count: number): string {
  const normalized = text.replace(/\s+/g, " ").trim()
  if (!normalized) return ""
  const sentences = normalized.match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g)
  if (!sentences) return normalized
  const cleaned = sentences.map((sentence) => sentence.trim()).filter((sentence) => sentence.length > 0)
  return cleaned.slice(-Math.max(1, count)).join(" ")
}
