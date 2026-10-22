import { useEffect, useRef, useState } from "react"
import { nostrRuntime } from "@app/nostr/runtime/NostrRuntime"
import { useChatContext } from "@app/screens/chat/chatContext"
import { knownFlashUsernames } from "./known-flash-users"

/** Load Chat contact names while Ask Flash is open, even if Chat was never opened. */
export const useKnownFlashUsers = (hostname: string): string[] => {
  const { contactsEvent, profileMap, addEventToProfiles } = useChatContext()
  const addProfile = useRef(addEventToProfiles)
  addProfile.current = addEventToProfiles
  const [names, setNames] = useState<string[]>([])

  useEffect(() => {
    const tags = contactsEvent?.tags
    const pubkeys = [
      ...new Set((tags ?? []).filter((tag) => tag[0] === "p").map((tag) => tag[1])),
    ]
    const store = nostrRuntime.getEventStore()
    const seen = new Map<string, string>()
    const refresh = () => {
      for (const pubkey of pubkeys) {
        const event = store.getLatest(`0:${pubkey}`)
        if (event && seen.get(pubkey) !== event.id) {
          addProfile.current(event)
          seen.set(pubkey, event.id)
        }
      }
      setNames(knownFlashUsernames(tags, profileMap, hostname))
    }
    refresh()
    if (!pubkeys.length) return

    const key = `ask-flash:contact-profiles:${contactsEvent?.id}`
    const unsubscribe = store.subscribe(refresh)
    nostrRuntime.ensureSubscription(key, { kinds: [0], authors: pubkeys })
    return () => {
      unsubscribe()
      nostrRuntime.releaseSubscription(key)
    }
  }, [contactsEvent, profileMap, hostname])

  return names
}
