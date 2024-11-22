import { useAppConfig } from "@app/hooks"
import {
  Rumor,
  fetchGiftWrapsForPublicKey,
  fetchSecretFromLocalStorage,
  getRumorFromWrap,
} from "@app/utils/nostr"
import { Event, SimplePool, SubCloser, getPublicKey, nip19 } from "nostr-tools"
import React from "react"
import { PropsWithChildren, createContext, useContext, useRef, useState } from "react"

type ChatContextType = {
  giftwraps: Event[]
  rumors: Rumor[]
  setGiftWraps: React.Dispatch<React.SetStateAction<Event[]>>
  setRumors: React.Dispatch<React.SetStateAction<Rumor[]>>
  poolRef?: React.MutableRefObject<SimplePool>
  profileMap: Map<string, NostrProfile> | undefined
  addEventToProfiles: (event: Event) => void
  resetChat: () => void
}

const publicRelays = [
  "wss://relay.damus.io",
  "wss://relay.primal.net",
  "wss://relay.staging.flashapp.me",
  "wss://relay.snort.social",
  "wss//nos.lol",
]

const ChatContext = createContext<ChatContextType>({
  giftwraps: [],
  setGiftWraps: () => {},
  rumors: [],
  setRumors: () => {},
  poolRef: undefined,
  profileMap: undefined,
  addEventToProfiles: (event: Event) => {},
  resetChat: () => {},
})

export const useChatContext = () => useContext(ChatContext)

export const ChatContextProvider: React.FC<PropsWithChildren> = ({ children }) => {
  const [giftwraps, setGiftWraps] = useState<Event[]>([])
  const [rumors, setRumors] = useState<Rumor[]>([])
  const [_, setLastEvent] = useState<Event>()
  const [closer, setCloser] = useState<SubCloser | null>(null)
  const profileMap = useRef<Map<string, NostrProfile>>(new Map<string, NostrProfile>())
  const poolRef = useRef(new SimplePool())
  const {
    appConfig: {
      galoyInstance: { relayUrl },
    },
  } = useAppConfig()

  const handleGiftWraps = (event: Event, secret: Uint8Array) => {
    setGiftWraps((prevEvents) => [...(prevEvents || []), event])
    try {
      let rumor = getRumorFromWrap(event, secret)
      setRumors((prevRumors) => {
        let previousRumors = prevRumors || []
        if (!previousRumors.map((r) => r.id).includes(rumor)) {
          return [...(prevRumors || []), rumor]
        }
        return prevRumors
      })
    } catch (e) {
      console.log("Error in decrypting...", e)
    }
  }

  React.useEffect(() => {
    let closer: SubCloser | undefined
    async function initialize(count = 0) {
      let secretKeyString = await fetchSecretFromLocalStorage()
      if (!secretKeyString) {
        if (count >= 3) return
        setTimeout(() => initialize(count + 1), 500)
        return
      }
      let secret = nip19.decode(secretKeyString).data as Uint8Array
      const publicKey = getPublicKey(secret)
      closer = fetchGiftWrapsForPublicKey(
        publicKey,
        (event) => handleGiftWraps(event, secret),
        poolRef!.current,
        relayUrl,
      )
      setCloser(closer)
    }
    if (poolRef && !closer) initialize()
  }, [poolRef])

  const addEventToProfiles = (event: Event) => {
    try {
      let content = JSON.parse(event.content)
      profileMap.current.set(event.pubkey, content)
      setLastEvent(event)
    } catch (e) {
      console.log("Couldn't parse the profile")
    }
  }

  const resetChat = async () => {
    setGiftWraps([])
    setRumors([])
    closer?.close()
    let secretKeyString = await fetchSecretFromLocalStorage()
    if (!secretKeyString) return
    let secret = nip19.decode(secretKeyString).data as Uint8Array
    const publicKey = getPublicKey(secret)
    let newCloser = fetchGiftWrapsForPublicKey(
      publicKey,
      (event) => handleGiftWraps(event, secret),
      poolRef!.current,
      relayUrl,
    )
    setCloser(newCloser)
  }

  return (
    <ChatContext.Provider
      value={{
        giftwraps,
        setGiftWraps,
        rumors,
        setRumors,
        poolRef,
        profileMap: profileMap.current,
        addEventToProfiles,
        resetChat,
      }}
    >
      {children}
    </ChatContext.Provider>
  )
}
