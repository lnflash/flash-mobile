import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { Event } from "nostr-tools"
import { getSigner } from "@app/nostr/signer"
import { useChatContext } from "../../../screens/chat/chatContext"
import { nostrRuntime } from "@app/nostr/runtime/NostrRuntime"
import { pool } from "@app/utils/nostr/pool"

// ===== Types =====

export type GroupMessage = {
  id: string
  authorId: string
  createdAt: number // unix milliseconds
  text: string
  isSystem?: boolean
}

export type NostrGroupChatProviderProps = {
  groupId: string
  relayUrls?: string[]
  adminPubkeys?: string[]
  children: React.ReactNode
}

type ContextValue = {
  messages: GroupMessage[]
  groupMetadata: { name?: string; about?: string; picture?: string }
  isMember: boolean
  knownMembers: Set<string>
  sendMessage: (text: string) => Promise<void>
  requestJoin: () => Promise<void>
}

const NostrGroupChatContext = createContext<ContextValue | undefined>(undefined)

// ===== Helpers =====
const makeSystemMessage = (text: string): GroupMessage => ({
  id: `sys-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  authorId: "system",
  createdAt: Date.now(),
  text,
  isSystem: true,
})

export const NostrGroupChatProvider: React.FC<NostrGroupChatProviderProps> = ({
  groupId,
  relayUrls = ["wss://groups.0xchat.com"],
  adminPubkeys,
  children,
}) => {
  const { userPublicKey } = useChatContext()

  const [messagesMap, setMessagesMap] = useState<Map<string, GroupMessage>>(new Map())
  const [isMember, setIsMember] = useState(false)
  const [knownMembers, setKnownMembers] = useState<Set<string>>(new Set())
  const [metadata, setMetadata] = useState<{
    name?: string
    about?: string
    picture?: string
  }>({})
  const prevMembersRef = useRef<Set<string>>(new Set())

  const messages = useMemo(() => {
    return Array.from(messagesMap.values()).sort((a, b) => b.createdAt - a.createdAt)
  }, [messagesMap])

  useEffect(() => {
    if (userPublicKey && knownMembers.size > 0) {
      setIsMember(knownMembers.has(userPublicKey))
    }
  }, [userPublicKey, knownMembers])

  // ----- Sub: group messages (kind 9) -----
  useEffect(() => {
    nostrRuntime.ensureSubscription(
      `nip29:messages`,
      { "#h": [groupId], "kinds": [9] },
      (event: Event) => {
        const msg: GroupMessage = {
          id: event.id,
          authorId: event.pubkey,
          createdAt: event.created_at * 1000,
          text: event.content,
        }
        setMessagesMap((prev) => {
          if (prev.has(msg.id)) return prev
          const next = new Map(prev)
          next.set(msg.id, msg)
          return next
        })
      },
      () => {},
      relayUrls,
    )
  }, [relayUrls.join("|"), groupId])

  // ----- Sub: group metadata (kind 39000) -----
  useEffect(() => {
    nostrRuntime.ensureSubscription(
      `nip29:group_metadata`,
      { "kinds": [39000], "#d": [groupId] },
      (event: Event) => {
        const result: { name?: string; about?: string; picture?: string } = {}
        for (const [key, value] of event.tags) {
          if (key === "name") result.name = value
          else if (key === "about") result.about = value
          else if (key === "picture") result.picture = value
        }
        setMetadata(result)
      },
      () => {},
      relayUrls,
    )
  }, [groupId])

  // ----- Sub: membership roster (kind 39002) -----
  useEffect(() => {
    const filters: any = { "kinds": [39002], "#d": [groupId] }
    if (adminPubkeys?.length) filters.authors = adminPubkeys

    nostrRuntime.ensureSubscription(
      `nip29:membership`,
      filters,
      (event: any) => {
        const currentMembers: string[] = event.tags
          .filter((tag: string[]) => tag?.[0] === "p" && tag[1])
          .map((tag: string[]) => tag[1])

        const currentSet = new Set(currentMembers)

        if (
          userPublicKey &&
          !prevMembersRef.current.has(userPublicKey) &&
          currentSet.has(userPublicKey)
        ) {
          setMessagesMap((prev) => {
            const next = new Map(prev)
            next.set(`sys-joined-self-${Date.now()}`, makeSystemMessage("You joined the group"))
            return next
          })
        }

        if (userPublicKey) setIsMember(currentSet.has(userPublicKey))

        currentMembers.forEach((pk) => {
          if (pk !== userPublicKey && !prevMembersRef.current.has(pk) && prevMembersRef.current.size !== 0) {
            const short = pk.slice(0, 6) + "…" + pk.slice(-4)
            setMessagesMap((prev) => {
              const next = new Map(prev)
              next.set(`sys-joined-${pk}-${Date.now()}`, makeSystemMessage(`${short} joined the group`))
              return next
            })
          }
        })

        prevMembersRef.current = currentSet
        setKnownMembers(currentSet)
      },
      () => {},
      relayUrls,
    )
  }, [relayUrls.join("|"), groupId, userPublicKey, adminPubkeys?.join("|")])

  // ----- Actions -----
  const sendMessage = useCallback(
    async (text: string) => {
      if (!userPublicKey) throw Error("No user pubkey present")
      const signer = await getSigner()
      const signedEvent = await signer.signEvent({
        kind: 9,
        created_at: Math.floor(Date.now() / 1000),
        tags: [["h", groupId, relayUrls[0]]],
        content: text,
        pubkey: userPublicKey,
      } as any)
      pool.publish(relayUrls, signedEvent)
    },
    [userPublicKey, groupId, relayUrls],
  )

  const requestJoin = useCallback(async () => {
    if (!userPublicKey) throw Error("No user pubkey present")
    const signer = await getSigner()
    const signedEvent = await signer.signEvent({
      kind: 9021,
      created_at: Math.floor(Date.now() / 1000),
      tags: [["h", groupId]],
      content: "I'd like to join this group.",
      pubkey: userPublicKey,
    } as any)
    pool.publish(relayUrls, signedEvent)

    setMessagesMap((prev) => {
      const next = new Map(prev)
      next.set(`sys-join-req-${Date.now()}`, makeSystemMessage("Join request sent"))
      return next
    })
  }, [userPublicKey, groupId, relayUrls])

  const value = useMemo<ContextValue>(
    () => ({ messages, isMember, knownMembers, sendMessage, requestJoin, groupMetadata: metadata }),
    [messages, isMember, knownMembers, sendMessage, requestJoin, metadata],
  )

  return (
    <NostrGroupChatContext.Provider value={value}>{children}</NostrGroupChatContext.Provider>
  )
}

export const useNostrGroupChat = () => {
  const ctx = useContext(NostrGroupChatContext)
  if (!ctx) throw new Error("useNostrGroupChat must be used inside NostrGroupChatProvider")
  return ctx
}
