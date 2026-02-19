import React, { createContext, useContext, useState, useRef } from "react"
import { PropsWithChildren } from "react"
import { Event } from "nostr-tools"
import { useAppConfig } from "@app/hooks"

import {
  Rumor,
  getRumorFromWrap,
  loadGiftwrapsFromStorage,
  saveGiftwrapsToStorage,
  fetchSecretFromLocalStorage,
} from "@app/utils/nostr"
import { nostrRuntime } from "@app/nostr/runtime/NostrRuntime"
import { getSigner, clearSigner } from "@app/nostr/signer"
import { loadJson, saveJson } from "@app/utils/storage"

const contactsEventCacheKey = (pubkey: string) => `contacts_event:${pubkey}`

type ChatContextType = {
  giftwraps: Event[]
  rumors: Rumor[]
  setGiftWraps: React.Dispatch<React.SetStateAction<Event[]>>
  setRumors: React.Dispatch<React.SetStateAction<Rumor[]>>
  profileMap: Map<string, any>
  addEventToProfiles: (event: Event) => void
  resetChat: () => Promise<void>
  initializeChat: (count?: number) => void
  userProfileEvent: Event | null
  userPublicKey: string | null
  refreshUserProfile: () => Promise<void>
  contactsEvent: Event | undefined
  setContactsEvent: (e: Event) => void
  getContactPubkeys: () => string[] | null
}

const ChatContext = createContext<ChatContextType>({
  giftwraps: [],
  setGiftWraps: () => {},
  rumors: [],
  setRumors: () => {},
  profileMap: new Map(),
  addEventToProfiles: () => {},
  resetChat: async () => {},
  initializeChat: () => {},
  userProfileEvent: null,
  userPublicKey: null,
  refreshUserProfile: async () => {},
  contactsEvent: undefined,
  setContactsEvent: () => {},
  getContactPubkeys: () => null,
})

export const useChatContext = () => useContext(ChatContext)

export const ChatContextProvider: React.FC<PropsWithChildren> = ({ children }) => {
  const [giftwraps, setGiftWraps] = useState<Event[]>([])
  const [rumors, setRumors] = useState<Rumor[]>([])
  const [userProfileEvent, setUserProfileEvent] = useState<Event | null>(null)
  const [userPublicKey, setUserPublicKey] = useState<string | null>(null)
  const [contactsEvent, setContactsEvent] = useState<Event>()
  const profileMap = useRef<Map<string, any>>(new Map())
  const processedEventIds = useRef<Set<string>>(new Set())

  const {
    appConfig: {
      galoyInstance: { relayUrl },
    },
  } = useAppConfig()

  // ------------------------
  // Helper: handle new giftwrap event
  // ------------------------
  const handleGiftWrapEvent = async (event: Event) => {
    if (processedEventIds.current.has(event.id)) return
    processedEventIds.current.add(event.id)

    setGiftWraps((prev) => {
      const updated = [...prev, event].sort((a, b) => a.created_at - b.created_at)
      saveGiftwrapsToStorage(updated)
      return updated
    })

    try {
      const signer = await getSigner()
      const rumor = await getRumorFromWrap(event, signer)
      setRumors((prev) => {
        if (!prev.map((r) => r.id).includes(rumor.id)) {
          return [...prev, rumor]
        }
        return prev
      })
    } catch (e) {
      console.log("Failed to decrypt giftwrap", e)
    }
  }

  // ------------------------
  // Initialize chat (fetch signer, set pubkey)
  // ------------------------
  const initializeChat = async (count = 0) => {
    const secretKeyString = await fetchSecretFromLocalStorage()
    if (!secretKeyString) {
      if (count >= 3) return
      setTimeout(() => initializeChat(count + 1), 500)
      return
    }

    let signer
    try {
      signer = await getSigner()
    } catch {
      if (count >= 3) return
      setTimeout(() => initializeChat(count + 1), 500)
      return
    }

    const publicKey = await signer.getPublicKey()
    setUserPublicKey(publicKey)

    // Load cached giftwraps
    const cachedGiftwraps = await loadGiftwrapsFromStorage()
    setGiftWraps(cachedGiftwraps)
    const decryptedRumors = (
      await Promise.all(
        cachedGiftwraps.map(async (wrap) => {
          try {
            return await getRumorFromWrap(wrap, signer)
          } catch {
            return null
          }
        }),
      )
    ).filter((r): r is Rumor => r !== null)
    setRumors(decryptedRumors)

    // ------------------------
    // Subscribe to giftwraps via NostrRuntime
    // ------------------------
    nostrRuntime.ensureSubscription(
      `giftwraps:${publicKey}`,
      {
        "kinds": [1059],
        "#p": [publicKey],
        "limit": 150,
      },
      (event) => handleGiftWrapEvent(event),
    )

    // Load cached contacts event so the contact list is available immediately
    const cachedContactsEvent = await loadJson(contactsEventCacheKey(publicKey))
    if (cachedContactsEvent) {
      setContactsEvent(cachedContactsEvent as Event)
    }

    // Subscribe to contact list — update only if the relay returns a newer version
    nostrRuntime.ensureSubscription(
      `contacts:${publicKey}`,
      {
        kinds: [3],
        authors: [publicKey],
      },
      (event) => {
        setContactsEvent((prev) => {
          if (!prev || event.created_at > prev.created_at) {
            saveJson(contactsEventCacheKey(publicKey), event)
            return event
          }
          return prev
        })
      },
    )

    // Subscribe to user profile
    nostrRuntime.ensureSubscription(
      `profile:${publicKey}`,
      {
        kinds: [0],
        authors: [publicKey],
      },
      (event) => {
        setUserProfileEvent(event)
        try {
          const content = JSON.parse(event.content)
          profileMap.current.set(event.pubkey, content)
        } catch {
          console.log("Failed to parse profile content")
        }
      },
    )
  }

  // ------------------------
  // Refresh user profile (re-fetch from runtime)
  // ------------------------
  const refreshUserProfile = async () => {
    if (!userPublicKey) return
    return new Promise<void>((resolve) => {
      const canonicalKey = `profile:${userPublicKey}`
      const latest = nostrRuntime.getEventStore().getLatest(canonicalKey)
      if (latest) {
        setUserProfileEvent(latest)
        try {
          profileMap.current.set(latest.pubkey, JSON.parse(latest.content))
        } catch {}
      }
      resolve()
    })
  }

  const getContactPubkeys = () => {
    if (!contactsEvent) return null
    return contactsEvent.tags.filter((t) => t[0] === "p").map((t) => t[1])
  }

  // ------------------------
  // Reset chat (clear signer, events & resubscribe)
  // ------------------------
  const resetChat = async () => {
    clearSigner()
    setGiftWraps([])
    setRumors([])
    setContactsEvent(undefined)
    setUserProfileEvent(null)
    setUserPublicKey(null)
    processedEventIds.current.clear()
    nostrRuntime.getEventStore().clear()
    await initializeChat()
  }

  // Initialize on mount
  React.useEffect(() => {
    initializeChat()
  }, [])

  return (
    <ChatContext.Provider
      value={{
        giftwraps,
        setGiftWraps,
        rumors,
        setRumors,
        profileMap: profileMap.current,
        addEventToProfiles: (event: Event) => {
          try {
            profileMap.current.set(event.pubkey, JSON.parse(event.content))
          } catch {}
        },
        resetChat,
        initializeChat,
        userProfileEvent,
        userPublicKey,
        refreshUserProfile,
        contactsEvent,
        setContactsEvent,
        getContactPubkeys,
      }}
    >
      {children}
    </ChatContext.Provider>
  )
}
