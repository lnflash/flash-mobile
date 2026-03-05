import React, { createContext, useContext, useState, useRef } from "react"
import { PropsWithChildren } from "react"
import { Event } from "nostr-tools"
import { useAppConfig } from "@app/hooks"

import {
  Rumor,
  getRumorFromWrap,
  loadGiftwrapsFromStorage,
  saveGiftwrapsToStorage,
  loadRumorsFromStorage,
  saveRumorsToStorage,
  loadReactionsFromStorage,
  saveReactionsToStorage,
  fetchSecretFromLocalStorage,
} from "@app/utils/nostr"
import { nostrRuntime } from "@app/nostr/runtime/NostrRuntime"
import { getSigner, clearSigner } from "@app/nostr/signer"
import { loadJson, saveJson } from "@app/utils/storage"

const contactsEventCacheKey = (pubkey: string) => `contacts_event:${pubkey}`
const profileEventCacheKey = (pubkey: string) => `user_profile_event:${pubkey}`

export type ReactionEntry = { emoji: string; reactor: string; pending?: boolean }

type ChatContextType = {
  giftwraps: Event[]
  rumors: Rumor[]
  setGiftWraps: React.Dispatch<React.SetStateAction<Event[]>>
  setRumors: React.Dispatch<React.SetStateAction<Rumor[]>>
  reactions: Map<string, ReactionEntry[]>
  addOptimisticReaction: (messageId: string, emoji: string, reactor: string) => void
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
  reactions: new Map(),
  addOptimisticReaction: () => {},
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
  const [reactions, setReactions] = useState<Map<string, ReactionEntry[]>>(new Map())
  const [userProfileEvent, setUserProfileEvent] = useState<Event | null>(null)
  const [userPublicKey, setUserPublicKey] = useState<string | null>(null)
  const [contactsEvent, setContactsEvent] = useState<Event>()
  const profileMap = useRef<Map<string, any>>(new Map())
  const processedEventIds = useRef<Set<string>>(new Set())
  const rumorWrapIds = useRef<Set<string>>(new Set())

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
      if (rumor.kind === 7) {
        // NIP-25 reaction
        const originalId = rumor.tags.find((t) => t[0] === "e")?.[1]
        if (originalId) {
          setReactions((prev) => {
            const existing = prev.get(originalId) || []
            const idx = existing.findIndex(
              (r) => r.reactor === rumor.pubkey && r.emoji === rumor.content,
            )
            if (idx >= 0) {
              // Confirm an optimistic entry, or skip if already confirmed
              if (!existing[idx].pending) return prev
              const next = new Map(prev)
              const updated = [...existing]
              updated[idx] = { emoji: rumor.content, reactor: rumor.pubkey }
              next.set(originalId, updated)
              saveReactionsToStorage(next)
              return next
            }
            const next = new Map(prev)
            next.set(originalId, [...existing, { emoji: rumor.content, reactor: rumor.pubkey }])
            saveReactionsToStorage(next)
            return next
          })
        }
      } else {
        setRumors((prev) => {
          if (prev.some((r) => r.id === rumor.id)) return prev
          const next = [...prev, rumor]
          saveRumorsToStorage(next)
          return next
        })
      }
    } catch {
      // giftwrap not decryptable by this key
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

    const cachedGiftwraps = await loadGiftwrapsFromStorage()
    cachedGiftwraps.forEach((wrap) => processedEventIds.current.add(wrap.id))
    setGiftWraps(cachedGiftwraps)

    // Load pre-decrypted rumors from cache — avoids re-decrypting all giftwraps on every startup
    const cachedRumors = await loadRumorsFromStorage()
    const cachedRumorIds = new Set(cachedRumors.map((r) => r.id))

    // Only decrypt giftwraps that aren't already in the rumors cache
    const uncachedWraps = cachedGiftwraps.filter((wrap) => {
      // A giftwrap can produce a rumor we haven't cached yet; we can't know the rumor id
      // without decrypting, so decrypt wraps whose id isn't tracked yet via a separate set.
      return !rumorWrapIds.current.has(wrap.id)
    })

    let newRumors: Rumor[] = []
    if (uncachedWraps.length > 0) {
      const decrypted = (
        await Promise.all(
          uncachedWraps.map(async (wrap) => {
            try {
              const r = await getRumorFromWrap(wrap, signer)
              rumorWrapIds.current.add(wrap.id)
              return r
            } catch {
              return null
            }
          }),
        )
      ).filter((r): r is Rumor => r !== null)

      const seenIds = new Set(cachedRumorIds)
      newRumors = decrypted.filter((r) => {
        if (seenIds.has(r.id)) return false
        seenIds.add(r.id)
        return true
      })
    }

    const allRumors = [...cachedRumors, ...newRumors]
    setRumors(allRumors)
    if (newRumors.length > 0) saveRumorsToStorage(allRumors)

    // Restore cached reactions
    const cachedReactions = await loadReactionsFromStorage()
    const reactionsMap = new Map(
      Object.entries(cachedReactions).map(([k, v]) => [k, v]),
    )
    if (reactionsMap.size > 0) setReactions(reactionsMap)

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

    // Load cached profile event so settings screen renders immediately
    const cachedProfile = await loadJson(profileEventCacheKey(publicKey))
    if (cachedProfile) {
      setUserProfileEvent(cachedProfile as Event)
      try {
        profileMap.current.set(publicKey, JSON.parse((cachedProfile as Event).content))
      } catch {}
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
        setUserProfileEvent((prev) => {
          if (!prev || event.created_at > prev.created_at) {
            saveJson(profileEventCacheKey(publicKey), event)
            try {
              profileMap.current.set(event.pubkey, JSON.parse(event.content))
            } catch {}
            return event
          }
          return prev
        })
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

  const addOptimisticReaction = (messageId: string, emoji: string, reactor: string) => {
    setReactions((prev) => {
      const existing = prev.get(messageId) || []
      if (existing.some((r) => r.reactor === reactor && r.emoji === emoji)) return prev
      const next = new Map(prev)
      next.set(messageId, [...existing, { emoji, reactor, pending: true }])
      return next
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
    setReactions(new Map())
    setUserProfileEvent(null)
    setUserPublicKey(null)
    processedEventIds.current.clear()
    rumorWrapIds.current.clear()
    saveRumorsToStorage([])
    saveReactionsToStorage(new Map())
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
        reactions,
        addOptimisticReaction,
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
