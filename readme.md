> [!NOTE]
> This project is currently unfinished.<br>
> Most of the functionality is there, I just need to polish some things up, which I will do soon™

# About
This is an AI text to speech (TTS) program for The Finals game, that uses the voices of Scotty and June, the in game announcers, to automatically generate speech to thank Twitch subscribers for their sub.<br>
In the future, members of chat will be able to redeem channel points to prompt Scotty or June to say whatever they like!

At the moment, the app connects to Twitch EventSub to listen for subscription events. The name of the user, the event type, and context are sent to OpenAI where the text for the announcement is generated.

If the generated text contains the word "June", it then sends the previously generated (Scotty) text to OpenAI to generate a response from June. This makes the responses feel much more dynamic and lively.

The generated text is then sent to ElevenLabs to generate the speech for Scotty and June.


### TODO: 
- [ ] Stream the ElevenLabs AI speech to an overlay page to allow OBS (or other stream capture program) to pick play the speech in real time.
- [ ] Capture clean speech audio of Scotty and June in game for ElevenLabs training.
- [ ] Add support for alternative donation platforms, such as Stream Elements.
- [ ] Add channel points redeem / chat command for chat members to play custom messages with AI voice.
  - [ ] Add profanity filtering.
-  [ ] Look into Twitch PubSub, which may give better info on new and *renewed* subs, perhaps without the need for auth.
