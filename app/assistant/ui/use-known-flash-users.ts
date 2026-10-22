import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import { useContactsQuery, useHomeAuthedQuery } from "@app/graphql/generated"
import { useConnectivity } from "@app/hooks/use-connectivity"
import { nostrRuntime } from "@app/nostr/runtime/NostrRuntime"
import { useChatContext } from "@app/screens/chat/chatContext"
import { knownFlashUsernames } from "./known-flash-users"
import type { RecentFlashUsers } from "./recent-flash-users"

/** One set of Chat and payment usernames for every Ask Flash username action. */
export const useKnownFlashUsers = (
  hostname: string,
  recent: RecentFlashUsers,
): string[] => {
  const { isOffline } = useConnectivity()
  const { data } = useContactsQuery({ fetchPolicy: "cache-first", skip: isOffline })
  const { data: home } = useHomeAuthedQuery({ fetchPolicy: "cache-only" })
  const remembered = useSyncExternalStore(recent.subscribe, recent.get)
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
      const next = knownFlashUsernames(tags, profileMap, hostname)
      setNames((previous) =>
        previous.length === next.length && previous.every((name, i) => name === next[i])
          ? previous
          : next,
      )
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

  const current = useMemo(
    () => [
      ...new Set([
        ...names,
        ...(data?.me?.contacts.map(({ username }) => username) ?? []),
        ...(home?.me?.defaultAccount.transactions?.edges ?? []).flatMap(({ node }) =>
          [node.initiationVia, node.settlementVia].flatMap((via) =>
            "counterPartyUsername" in via && via.counterPartyUsername
              ? [via.counterPartyUsername]
              : [],
          ),
        ),
      ]),
    ],
    [names, data, home],
  )
  useEffect(() => {
    recent.remember(current)
  }, [recent, current])
  return useMemo(() => [...new Set([...current, ...remembered])], [current, remembered])
}
