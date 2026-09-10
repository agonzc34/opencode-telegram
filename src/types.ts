export type LogLevel = "debug" | "info" | "warn" | "error"

export type PluginSettings = {
  botToken: string
  chatId: string
  allowedUserId?: string
  enabled: boolean
  maxMessageChars: number
  logLevel: LogLevel
  completionEnabled: boolean
  completionSentences: number
}

export type InlineButton = { text: string; callback_data: string }

export type QuestionOption = { label: string; description: string }

export type QuestionInfo = {
  question: string
  header: string
  options: QuestionOption[]
  multiple?: boolean
  custom?: boolean
}

export type PermissionRequestInfo = {
  id: string
  sessionID: string
  permission: string
  patterns: string[]
  always: string[]
}

export type QuestionRequestInfo = {
  id: string
  sessionID: string
  questions: QuestionInfo[]
  tool?: { messageID: string; callID: string }
}
