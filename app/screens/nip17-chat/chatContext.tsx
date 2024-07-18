import { Rumor } from "@app/utils/nostr"
import { Event } from "nostr-tools"
import { PropsWithChildren, createContext, useContext, useState } from "react"

type ChatContextType = {
  giftwraps: Event[]
  rumors: Rumor[]
  setGiftWraps: React.Dispatch<React.SetStateAction<Event[]>>
  setRumors: React.Dispatch<React.SetStateAction<Rumor[]>>
}

const ChatContext = createContext<ChatContextType>({
  giftwraps: [],
  setGiftWraps: () => {},
  rumors: [],
  setRumors: () => {},
})

export const useChatContext = () => useContext(ChatContext)

export const ChatContextProvider: React.FC<PropsWithChildren> = ({ children }) => {
  const [giftwraps, setGiftWraps] = useState<Event[]>([])
  const [rumors, setRumors] = useState<Rumor[]>([])

  return (
    <ChatContext.Provider value={{ giftwraps, setGiftWraps, rumors, setRumors }}>
      {children}
    </ChatContext.Provider>
  )
}
