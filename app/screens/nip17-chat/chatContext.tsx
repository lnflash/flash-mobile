import { useAppConfig } from "@app/hooks"
import {
  Rumor,
  fetchGiftWrapsForPublicKey,
  fetchNostrUsers,
  fetchSecretFromLocalStorage,
  getRumorFromWrap,
  getSecretKey,
  loadGiftwrapsFromStorage,
  saveGiftwrapsToStorage,
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
  resetChat: () => Promise<void>
  initializeChat: (count?: number) => void
  activeSubscription: SubCloser | null
  userProfileEvent: Event | null
  userPublicKey: string | null
  refreshUserProfile: () => Promise<void>
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
  resetChat: () => new Promise(() => {}),
  initializeChat: () => {},
  activeSubscription: null,
  userProfileEvent: null,
  userPublicKey: null,
  refreshUserProfile: async () => {},
})

export const useChatContext = () => useContext(ChatContext)

export const ChatContextProvider: React.FC<PropsWithChildren> = ({ children }) => {
  const [giftwraps, setGiftWraps] = useState<Event[]>([])
  const [rumors, setRumors] = useState<Rumor[]>([])
  const [_, setLastEvent] = useState<Event>()
  const [closer, setCloser] = useState<SubCloser | null>(null)
  const [userProfileEvent, setUserProfileEvent] = useState<Event | null>(null)
  const [userPublicKey, setUserPublicKey] = useState<string | null>(null)
  const profileMap = useRef<Map<string, NostrProfile>>(new Map<string, NostrProfile>())
  const poolRef = useRef(new SimplePool())
  const processedEventIds = useRef(new Set())

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
    if (poolRef && !closer) initializeChat()
  }, [poolRef])

  React.useEffect(() => {
    const initializeUserProfile = async () => {
      if (!poolRef.current || !userPublicKey) return

      await refreshUserProfile()
    }

    if (userPublicKey) {
      initializeUserProfile()
    }
  }, [userPublicKey])

  const refreshUserProfile = async () => {
    if (!poolRef.current) return
    let publicKey = userPublicKey
    if (!publicKey) {
      let secret = await getSecretKey()
      if (!secret) {
        setUserProfileEvent(null)
        return
      }
      publicKey = getPublicKey(secret)
      setUserPublicKey(publicKey)
    }
    return new Promise<void>((resolve) => {
      fetchNostrUsers([publicKey], poolRef.current, (event: Event, profileCloser) => {
        setUserProfileEvent(event)
        try {
          let content = JSON.parse(event.content)
          profileMap.current.set(event.pubkey, content)
        } catch (e) {
          console.log("Couldn't parse the profile", e)
        }
        profileCloser.close()
        resolve()
      })
    })
  }

  const initializeChat = async (count = 0) => {
    if (closer) closer.close()
    let secretKeyString = await fetchSecretFromLocalStorage()
    if (!secretKeyString) {
      if (count >= 3) return
      setTimeout(() => initializeChat(count + 1), 500)
      return
    }
    let secret = nip19.decode(secretKeyString).data as Uint8Array
    const publicKey = getPublicKey(secret)
    setUserPublicKey(publicKey)
    const cachedGiftwraps = await loadGiftwrapsFromStorage()
    setGiftWraps(cachedGiftwraps)
    let cachedRumors = []
    try {
      cachedRumors = cachedGiftwraps.map((wrap) => getRumorFromWrap(wrap, secret))
    } catch (e) {
      console.log("ERROR WHILE DECRYPTING RUMORS", e)
    }
    setRumors(cachedRumors)
    let newCloser = await fetchNewGiftwraps(cachedGiftwraps, publicKey)
    setCloser(newCloser)
  }

  const fetchNewGiftwraps = async (cachedGiftwraps: Event[], publicKey: string) => {
    cachedGiftwraps = cachedGiftwraps.sort((a, b) => a.created_at - b.created_at)
    const lastCachedEvent = cachedGiftwraps[cachedGiftwraps.length - 1]
    let secretKeyString = await fetchSecretFromLocalStorage()
    if (!secretKeyString) {
      return null
    }
    let secret = nip19.decode(secretKeyString).data as Uint8Array
    let closer = fetchGiftWrapsForPublicKey(
      publicKey,
      (event) => {
        if (!processedEventIds.current.has(event.id)) {
          processedEventIds.current.add(event.id)
          setGiftWraps((prev) => {
            const updatedGiftwraps = mergeGiftwraps(prev, [event])
            saveGiftwrapsToStorage(updatedGiftwraps)
            return updatedGiftwraps
          })
          let rumor = getRumorFromWrap(event, secret)
          setRumors((prevRumors) => {
            let previousRumors = prevRumors || []
            if (!previousRumors.map((r) => r.id).includes(rumor)) {
              return [...(prevRumors || []), rumor]
            }
            return prevRumors
          })
        }
      },
      poolRef.current,
      lastCachedEvent?.created_at - 20 * 60,
    )
    return closer
  }

  const mergeGiftwraps = (cachedGiftwraps: Event[], fetchedGiftwraps: Event[]) => {
    const existingIds = new Set(cachedGiftwraps.map((wrap) => wrap.id))
    const newGiftwraps = fetchedGiftwraps.filter((wrap) => !existingIds.has(wrap.id))
    return [...cachedGiftwraps, ...newGiftwraps]
  }

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
    setUserPublicKey(null)
    setUserProfileEvent(null)
    closer?.close()
    let secretKeyString = await fetchSecretFromLocalStorage()
    if (!secretKeyString) return
    let secret = nip19.decode(secretKeyString).data as Uint8Array
    const publicKey = getPublicKey(secret)
    setUserPublicKey(getPublicKey(secret))
    let newCloser = fetchGiftWrapsForPublicKey(
      publicKey,
      (event) => handleGiftWraps(event, secret),
      poolRef!.current,
    )
    setCloser(newCloser)
  }

  return (
    <ChatContext.Provider
      value={{
        giftwraps,
        setGiftWraps,
        initializeChat,
        rumors,
        setRumors,
        poolRef,
        profileMap: profileMap.current,
        addEventToProfiles,
        resetChat,
        activeSubscription: closer,
        userProfileEvent,
        userPublicKey,
        refreshUserProfile,
      }}
    >
      {children}
    </ChatContext.Provider>
  )
}
