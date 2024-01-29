import WebSocket from 'ws'
import { generateVoice, streamAudioToClient } from '../index'
import { parseMessage } from './ircParser'

const scottyVoiceId = process.env.SCOTTY_VOICE_ID
const juneVoiceId = process.env.JUNE_VOICE_ID

const handleCommand = (bot: WebSocket, command: { botCommand?: string, botCommandParams?: string }, channelNick: string): void => {
  if (command.botCommand === 'scotty') {
    // do scotty shit
    console.log(command.botCommand)
    console.log(command.botCommandParams)
    if ((command.botCommandParams == null) || (scottyVoiceId == null)) { return }
    void generateVoice(command.botCommandParams, scottyVoiceId, './outputs/scotty.mp3')
  }

  if (command.botCommand === 'june') {
    // do june shit
    console.log(command.botCommand)
    console.log(command.botCommandParams)
    if ((command.botCommandParams == null) || (juneVoiceId == null)) { return }
    void generateVoice(command.botCommandParams, juneVoiceId, './outputs/june.mp3').then((data) => {
      streamAudioToClient(data)
    })
  }

  if (command.botCommand === 'hi') {
    // do scotty shit
    console.log('send hello!')
    bot.send(`PRIVMSG #${channelNick} :Hello!`)
  }
}

const startChatBot = (accessToken: string, channelNick: string): void => {
  const bot = new WebSocket('wss://irc-ws.chat.twitch.tv:443')
  console.log(accessToken)

  bot.addEventListener('open', () => {
    console.log('WebSocket connection established!')

    bot.send(`PASS oauth:${accessToken}`)
    bot.send(`NICK ${channelNick}`)
  })

  bot.addEventListener('message', (event: WebSocket.MessageEvent) => {
    const ircMessage = event
    // console.log(ircMessage)

    if (ircMessage.type !== 'message') { return }
    const rawIrcMessage = (ircMessage.data as string).trimEnd()
    // console.log('RAW ' + rawIrcMessage)

    const messages = rawIrcMessage.split('\r\n')
    for (const message of messages) {
      // messages.forEach(async (message) => {
      const parsedMessage = parseMessage(message)
      if (parsedMessage === undefined) { return }
      console.log('PARSED' + JSON.stringify(parsedMessage))

      if ((parsedMessage?.command) != null) {
        switch (parsedMessage.command.command) {
          case 'PRIVMSG':
            if (typeof (parsedMessage.command.botCommand) === 'string') {
              handleCommand(bot, parsedMessage.command, channelNick)
            }
            break
          case '001':
            // Successfully logged in, so join the channel.
            bot.send(`JOIN #${channelNick}`)
            console.log('Joined channel!')
            break
          case 'NOTICE':
            // If the authentication failed, leave the channel.
            // The server will close the connection.
            if (parsedMessage.parameters === 'Login authentication failed') {
              console.log(`Authentication failed; left ${channelNick}`)
              bot.send(`PART ${channelNick}`)
            }
            if (parsedMessage.parameters === 'Improperly formatted auth') {
              console.log(`Authentication failed; left ${channelNick}`)
              bot.send(`PART ${channelNick}`)
            } else if (parsedMessage.parameters === "You don't have permission to perform that action") {
              console.log(`No permission. Check if the access token is still valid. Left ${channelNick}`)
              bot.send(`PART ${channelNick}`)
            }
            break
          case 'PING':
            bot.send('PONG ' + parsedMessage.parameters)
            break
        }
      }
    }
  })
}

export default startChatBot
