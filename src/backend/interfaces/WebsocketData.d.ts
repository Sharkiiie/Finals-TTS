interface Payload {
  event?: {
    user_name: string
  }
  subscription?: {
    type: string
  }
  session?: {
    status: string
    id: string
  }
}

interface Metadata {
  message_type: string
}

interface WebSocketData {
  payload: Payload
  metadata: Metadata
}

export type { Payload, Metadata, WebSocketData }
