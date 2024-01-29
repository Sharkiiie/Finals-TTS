interface IrcMessage {
  data: string
  type: string
  command: {
    command: string
    botCommand: string
  }
}

interface ParsedMessage {
  tags?: object | null
  source?: object | null
  command?: {
    botCommand?: string
    botCommandParams?: string
    command?: string | null
  }
  parameters?: string
}

export type { IrcMessage, ParsedMessage }
