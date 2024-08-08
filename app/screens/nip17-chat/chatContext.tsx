import { Rumor } from "@app/utils/nostr"
import { Event, SimplePool, SubCloser } from "nostr-tools"
import { PropsWithChildren, createContext, useContext, useRef, useState } from "react"

type ChatContextType = {
  giftwraps: Event[]
  rumors: Rumor[]
  setGiftWraps: React.Dispatch<React.SetStateAction<Event[]>>
  setRumors: React.Dispatch<React.SetStateAction<Rumor[]>>
  poolRef?: React.MutableRefObject<SimplePool>
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
})

export const useChatContext = () => useContext(ChatContext)

export const ChatContextProvider: React.FC<PropsWithChildren> = ({ children }) => {
  const [giftwraps, setGiftWraps] = useState<Event[]>([])
  const [rumors, setRumors] = useState<Rumor[]>([])

  const poolRef = useRef(new SimplePool())

  return (
    <ChatContext.Provider value={{ giftwraps, setGiftWraps, rumors, setRumors, poolRef }}>
      {children}
    </ChatContext.Provider>
  )
}
