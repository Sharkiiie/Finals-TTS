import WebSocket from 'ws'
import axios, { type AxiosResponse } from 'axios'
import OpenAi from 'openai'
import express from 'express'
import path from 'path'
import 'dotenv/config'
import * as fs from 'fs'
import startChatBot from './chatbot/bot'
import { type Payload, type WebSocketData } from './interfaces/WebsocketData'
import { type Auth, type TokenFile, type Token } from './interfaces/Auth'
import { scotty, june } from './aiContext'
import querystring from 'querystring'
import { type ParsedText } from './interfaces/Text'

const testOnStart = true

const clientId = process.env.CLIENT_ID
const clientSecret = process.env.CLIENT_SECRET
const channelId = process.env.CHANNEL_ID
const channelNick = process.env.CHANNEL_NICK
const openaiApi = process.env.OPENAI_API
const elevenlabsApi = process.env.ELEVENLABS_API
const scottyVoiceId = process.env.SCOTTY_VOICE_ID
const juneVoiceId = process.env.JUNE_VOICE_ID
const tokenFile: TokenFile = JSON.parse(fs.readFileSync(path.join(__dirname, './tokens.json'), 'utf-8')) as TokenFile
let accessToken: string
let refreshToken: string

const ai = new OpenAi({ apiKey: openaiApi })
const wsUrl = 'wss://eventsub.wss.twitch.tv/ws'

const deleteSubs = async (): Promise<void> => {
  try {
    console.log('Deleting old subs...')
    await axios.get('https://api.twitch.tv/helix/eventsub/subscriptions',
      {
        headers: {
          Authorization: 'Bearer ' + accessToken,
          'Client-Id': clientId,
          'Content-Type': 'application/json'
        }
      }
    ).then(async response => {
      const data = response.data.data

      if (data === undefined || data.length < 1) {
        return
      }

      for (const sub of data) {
        const id = sub.id
        if (sub.status === 'websocket_disconnected') {
          await axios.delete(`https://api.twitch.tv/helix/eventsub/subscriptions?id=${id}`,
            {
              headers: {
                Authorization: 'Bearer ' + accessToken,
                'Client-Id': clientId,
                'Content-Type': 'application/json'
              }
            }
          )
          console.log('Deleted ' + id)
        }
      }
    })
    console.log('Old subs deleted.')
  } catch (err) {
    console.error('There was an error deleting old subs.', err)
  }
}

const subToEvents = async (sessionId: string): Promise<void> => {
  try {
    console.log('Subscribing to events...')
    await axios.post('https://api.twitch.tv/helix/eventsub/subscriptions',
      {

        type: 'channel.follow',
        version: '2',
        condition: { broadcaster_user_id: channelId, moderator_user_id: channelId },
        transport: { method: 'websocket', session_id: sessionId }

      },
      {
        headers: {
          Authorization: 'Bearer ' + accessToken,
          'Client-Id': clientId,
          'Content-Type': 'application/json'
        }
      }
    )
    console.log('Subscribed to follow events.')
  } catch (err) {
    console.error('There was an error subscribing to events.', err)
  }
}

const parseText = (text: string): { parsedText: string, mentionsJune: boolean } => {
  // Remove *actions*
  const asterisksRegex = /\*.*?\*/g
  let parsedText = text.replace(asterisksRegex, '')

  // Remove Scotty prefix
  const scottyRegex = /Scotty:/g
  parsedText = parsedText.replace(scottyRegex, '')

  // Check if June is mentioned
  const juneCheck = text.includes('June')

  // Remove June prefix
  const juneRegex = /June:/g
  parsedText = parsedText.replace(juneRegex, '')

  return {
    parsedText,
    mentionsJune: juneCheck
  }
}

const generateText = async (announcer: string, content: string): Promise<ParsedText | undefined> => {
  try {
    const chatCompletion = await ai.chat.completions.create({
      messages: [
        { role: 'system', content: announcer },
        { role: 'user', content }
      ],
      model: 'gpt-3.5-turbo'
    })

    if (chatCompletion.choices[0].message.content != null) {
      return parseText(chatCompletion.choices[0].message.content)
    } else {
      throw new Error('AI returned null instead of text.')
    }
  } catch (error) {
    console.log(error)
  }
}

const streamAudioToClient = async (data: AxiosResponse['data']) => {
  data.on('data')
}

const generateVoice = async (parsedText: string, voiceId: string, filename: string): Promise<AxiosResponse['data']> => {
  try {
    await axios.post(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`,
      // ?output_format=mp3_44100_32
      {
        model_id: 'eleven_multilingual_v2',
        text: parsedText,
        voice_settings: {
          style: 0.5,
          stability: 0.5,
          similarity_boost: 0.5
        }
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': elevenlabsApi,
          Accept: 'audio/mpeg'
        },
        responseType: 'stream'
      }
    ).then(async res => {
      // await res.data.pipe(fs.createWriteStream(filename))
      await streamAudioToClient(res.data)
      return res.data
    })
  } catch (error) {
    console.error(error)
  }
}

const handleSub = async (payload: Payload) => {
  const sub = payload.subscription
  const subEvent = payload.event

  if ((sub == null) || (subEvent == null)) { return }
  const content = `Event: '${sub.type}', User: '${subEvent.user_name}'`
  console.log(content)
  const scottyText = await generateText(scotty, content)

  if ((scottyText == null) || (scottyVoiceId == null)) { console.error('One or more Scotty env variable(s) not set.'); return }
  console.log(scottyText?.parsedText)
  const scottyAudio = await generateVoice(scottyText?.parsedText, scottyVoiceId, './outputs/scotty.mp3')
  await streamAudioToClient(scottyAudio as ArrayBuffer)
  // scottyAudio.pipe(fs.createWriteStream('./outputs/scotty2.mp3'))

  if (scottyAudio !== undefined) { return }

  if (!scottyText.mentionsJune) { return }
  const juneText = await generateText(june, scottyText.parsedText)

  // if ((juneText == null) || (juneVoiceId == null)) { console.error('One or more June env variable(s) not set.'); return }
  // console.log(juneText?.parsedText)
  // const juneAudio = await generateVoice(juneText?.parsedText, juneVoiceId, './outputs/june.mp3')
}

const wsEventHandler = async (data: WebSocketData): Promise<void> => {
  // console.log(data)

  // Subscribe to events on new connection
  if (data?.payload?.session?.status === 'connected' && (data.payload.session.id !== '')) {
    const sessionId = data.payload.session.id

    await deleteSubs()
    await subToEvents(sessionId)
  }

  // TODO: Remove later
  if (data.metadata.message_type !== 'session_keepalive') {
    // console.log(data)
  } else {
    console.log('Session alive.')
  }

  if (data.payload.subscription != null) {
    await handleSub(data.payload)
  }
}

const getAccessToken = async (authCode?: string): Promise<void> => {
  let query = querystring.stringify(
    {
      client_id: clientId,
      client_secret: clientSecret,
      code: authCode,
      grant_type: 'authorization_code',
      redirect_uri: 'http://localhost:3000/auth/'
    }
  )

  if (tokenFile.refreshToken !== '') {
    refreshToken = tokenFile.refreshToken
    query = querystring.stringify(
      {
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
        redirect_uri: 'http://localhost:3000/auth/'
      }
    )
  }

  console.log('Getting access token...')
  try {
    await axios.post('https://id.twitch.tv/oauth2/token', query).then((res) => {
      // console.log(res)
      const data: Token = res.data

      if ((data.access_token == null) || (data.refresh_token == null)) {
        console.error('Access token not received.')
        return
      }

      tokenFile.accessToken = data.access_token
      tokenFile.refreshToken = data.refresh_token
      fs.writeFileSync(path.join(__dirname, './tokens.json'), JSON.stringify(tokenFile, null, 2))
      accessToken = data.access_token
      console.log('Got access token!')
      startWebSocket()
    })
  } catch (error) {
    console.error(error)
    console.error('Failed to get access token.')
    process.exit(1)
  }
}

const checkAccessToken = async (): Promise<void> => {
  if ((tokenFile.authCode === '') && (tokenFile.refreshToken === '')) {
    console.error('Need auth code! Go to: http://localhost:3000')

    await new Promise<string | undefined>((resolve) => {
      const intervalId = setInterval(() => {
        if ((tokenFile.authCode !== '') || (tokenFile.refreshToken !== '')) {
          clearInterval(intervalId)
          resolve('Success!')
        }
      }, 500)
    })
  }
  await getAccessToken(tokenFile.authCode)
}

const startWebSocket = (): void => {
  const ws = new WebSocket(wsUrl)

  ws.addEventListener('open', () => {
    console.info('WS connection opened.')

    if (!testOnStart) { return }
    void handleSub(
      {
        subscription: { type: 'channel.follow' },
        event: { user_name: 'Akino' }
      }
    )
  })

  ws.addEventListener('message', (event: WebSocket.MessageEvent) => {
    let data: WebSocketData

    if (typeof (event.data) === 'string') {
      data = JSON.parse(event.data)
      void wsEventHandler(data)
    }
  })

  ws.addEventListener('close', (event: WebSocket.CloseEvent) => {
    console.info('WS Connection Closed: ' + event.reason)
  })
}

const app = express()
const port = 3000

app.get('/', (_req, res) => {
  const file = path.join(__dirname, '../frontend/index.html')
  res.sendFile(file)
})

app.get('/auth', (req: Auth, res) => {
  if ((req.query?.error) != null) {
    console.error(`Error receiving auth code: ${req.query.error}`)
    res.send(`Error receiving auth code: ${req.query.error}`)
    return
  }

  if (req.query?.code === undefined) {
    console.error('Auth code not received from Twitch.')
    res.send('Auth code not received from Twitch.')
    return
  }

  const authCode = req.query.code
  res.send(`Auth code received from Twitch! <br>
    You may close this page and use the application normally. <br>`
  )

  tokenFile.authCode = authCode
  fs.writeFileSync(path.join(__dirname, './tokens.json'), JSON.stringify(tokenFile, null, 2))

  void getAccessToken(authCode)
})

app.get('/overlay', (_req, res) => {
  const file = path.join(__dirname, '../frontend/overlay.html')
  res.sendFile(file)
})

app.listen(port, () => {
  void (async () => {
    console.log('Listening on port ' + port)
    await checkAccessToken()
    if (channelNick == null) { return }
    startChatBot(accessToken, channelNick)
  })()
}).on('error', () => {
  console.error('Error starting express.')
})

export { generateVoice, streamAudioToClient }
