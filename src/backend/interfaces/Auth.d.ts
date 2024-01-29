interface Auth {
  query?: {
    code?: string
    error?: string
  }
}

interface TokenFile {
  authCode: string
  accessToken: string
  refreshToken: string
}

interface Token {
  access_token?: string
  refresh_token?: string
}

export type { Auth, TokenFile, Token }
