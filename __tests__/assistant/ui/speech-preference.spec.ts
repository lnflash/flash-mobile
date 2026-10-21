import { ApolloClient, InMemoryCache } from "@apollo/client"
import { createSpeechPreference } from "@app/assistant/ui/speech-preference"
it("defaults off, restores only for the same session, and is cleared by logout's cache reset", async () => {
  const client = new ApolloClient({
    cache: new InMemoryCache(),
    connectToDevTools: false,
  })
  const preference = createSpeechPreference(client, "account-a")
  expect(preference.get()).toBe(false)
  preference.set(true)
  expect(createSpeechPreference(client, "account-a").get()).toBe(true)
  expect(createSpeechPreference(client, "account-b").get()).toBe(false)
  preference.set(true)
  await client.cache.reset()
  expect(createSpeechPreference(client, "account-a").get()).toBe(false)
})

it("persists voice and speed independently of automatic replies and isolates accounts", () => {
  const client = new ApolloClient({
    cache: new InMemoryCache(),
    connectToDevTools: false,
  })
  const preference = createSpeechPreference(client, "account-a")
  preference.configure({ voiceId: "installed-voice", rate: 0.8 })
  expect(preference.get()).toBe(false)
  preference.set(true)
  const restored = createSpeechPreference(client, "account-a")
  expect(restored.settings()).toEqual({ voiceId: "installed-voice", rate: 0.8 })
  restored.set(false)
  expect(restored.settings().voiceId).toBe("installed-voice")
  expect(createSpeechPreference(client, "account-b").settings()).toEqual({ rate: 1 })
})
it("bounds unsupported speeds and allows returning to the automatic voice", () => {
  const client = new ApolloClient({
    cache: new InMemoryCache(),
    connectToDevTools: false,
  })
  const preference = createSpeechPreference(client, "account")
  preference.configure({ voiceId: "voice", rate: 90 })
  expect(preference.settings().rate).toBe(1)
  preference.configure({ rate: 1.2 })
  expect(preference.settings()).toEqual({ voiceId: undefined, rate: 1.2 })
})
