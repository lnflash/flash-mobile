import { ApolloClient, gql } from "@apollo/client"
const QUERY = gql`
  query AssistantSpeechPreference {
    assistantSpeechPreference @client
  }
`
export type SpeechSettings = { voiceId?: string; rate: number }
export type SpeechPreference = {
  settings: () => SpeechSettings
  configure: (settings: SpeechSettings) => void
  get: () => boolean
  set: (enabled: boolean) => void
  subscribe: (listener: () => void) => () => void
}
/** Account/session-scoped opt-in in the existing persisted cache; reset on logout. */
export const createSpeechPreference = (
  client: ApolloClient<unknown>,
  scope?: string,
): SpeechPreference => {
  const listeners = new Set<() => void>()
  let enabled = false
  let settings: SpeechSettings = { rate: 1 }
  try {
    const raw = client.readQuery<{ assistantSpeechPreference: string }>({
      query: QUERY,
    })?.assistantSpeechPreference
    if (raw && scope) {
      const saved = JSON.parse(raw)
      enabled = saved.scope === scope && saved.enabled === true
      if (saved.scope === scope)
        settings = {
          voiceId: typeof saved.voiceId === "string" ? saved.voiceId : undefined,
          rate: [0.8, 1, 1.2].includes(saved.rate) ? saved.rate : 1,
        }
      if (saved.scope !== scope)
        client.cache.evict({ id: "ROOT_QUERY", fieldName: "assistantSpeechPreference" })
    }
  } catch {
    /* A missing or malformed preference is off. */
  }
  const save = () => {
    if (scope && typeof client.writeQuery === "function") {
      try {
        client.writeQuery({
          query: QUERY,
          data: {
            assistantSpeechPreference: JSON.stringify({ scope, enabled, ...settings }),
          },
        })
      } catch {
        /* Local preference; never fall back to a network request. */
      }
    }
    listeners.forEach((listener) => listener())
  }
  return {
    get: () => enabled,
    settings: () => settings,
    configure: (value) => {
      settings = {
        voiceId: value.voiceId,
        rate: [0.8, 1, 1.2].includes(value.rate) ? value.rate : 1,
      }
      save()
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    set: (value) => {
      enabled = value
      save()
    },
  }
}
