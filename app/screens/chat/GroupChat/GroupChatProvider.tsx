import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { finalizeEvent } from "nostr-tools"
import { MessageType } from "@flyerhq/react-native-chat-ui"
import { getSecretKey } from "@app/utils/nostr"
import { useChatContext } from "../../../screens/chat/chatContext"

// ===== Types =====
export type NostrGroupChatProviderProps = {
  groupId: string
  relayUrls?: string[]
  /**
   * Optional: limit membership/metadata events to known admin pubkeys.
   * If omitted, provider listens to any author.
   */
  adminPubkeys?: string[]
  children: React.ReactNode
}

type ContextValue = {
  messages: MessageType.Text[]
  groupMetadata: { [key: string]: string }
  isMember: boolean
  knownMembers: Set<string>
  /**
   * Send a plain text message to the group
   */
  sendMessage: (text: string) => Promise<void>
  /**
   * Request to join the group (NIP-29 join event)
   */
  requestJoin: () => Promise<void>
}

const NostrGroupChatContext = createContext<ContextValue | undefined>(undefined)

// ===== Helpers =====
const makeSystemText = (text: string): MessageType.Text => ({
  id: `sys-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  author: { id: "system" },
  createdAt: Date.now(),
  type: "text",
  text,
})

export const NostrGroupChatProvider: React.FC<NostrGroupChatProviderProps> = ({
  groupId,
  relayUrls = ["wss://groups.0xchat.com"],
  adminPubkeys,
  children,
}) => {
  const { poolRef, userPublicKey } = useChatContext()

  // Internal message map ensures dedupe by id
  const [messagesMap, setMessagesMap] = useState<Map<string, MessageType.Text>>(new Map())
  const [isMember, setIsMember] = useState(false)
  const [knownMembers, setKnownMembers] = useState<Set<string>>(new Set())
  const [metadata, setMetadata] = useState<{
    name?: string
    about?: string
    picture?: string
  }>({})
  // Track last known membership set to detect new joins for system messages
  const prevMembersRef = useRef<Set<string>>(new Set())

  // Sorted messages array for the UI (newest first)
  const messages = useMemo(() => {
    return Array.from(messagesMap.values()).sort((a, b) => b.createdAt! - a.createdAt!)
  }, [messagesMap])

  // ----- Sub: group messages (kind 9) -----
  useEffect(() => {
    if (!poolRef?.current) return
    const unsub = poolRef.current.subscribeMany(
      relayUrls,
      [
        {
          "#h": [groupId],
          "kinds": [9],
        },
      ],
      {
        onevent: (event: any) => {
          const msg: MessageType.Text = {
            id: event.id,
            author: { id: event.pubkey },
            createdAt: event.created_at * 1000,
            type: "text",
            text: event.content,
          }
          setMessagesMap((prev) => {
            if (prev.has(msg.id)) return prev
            const next = new Map(prev)
            next.set(msg.id, msg)
            return next
          })
        },
      },
    )

    return () => {
      if (unsub) unsub.close()
    }
  }, [poolRef?.current, relayUrls.join("|"), groupId])

  //metadata
  useEffect(() => {
    function parseGroupTags(tags: string[][]) {
      const result: { name?: string; about?: string; picture?: string } = {}
      for (const tag of tags) {
        const [key, value] = tag
        if (key === "name") result.name = value
        else if (key === "about") result.about = value
        else if (key === "picture") result.picture = value
      }
      return result
    }
    const unsub = poolRef?.current.subscribeMany(
      relayUrls,
      [{ "kinds": [39000], "#d": [groupId] }],
      {
        onevent: (event) => {
          const parsed = parseGroupTags(event.tags)
          setMetadata(parsed)
        },
      },
    )
    return () => unsub?.close()
  }, [poolRef?.current, groupId])

  // ----- Sub: membership roster (kind 39002) -----
  useEffect(() => {
    if (!poolRef?.current) return

    const filters: any = {
      "kinds": [39002],
      "#d": [groupId],
    }
    if (adminPubkeys?.length) filters.authors = adminPubkeys

    const unsub = poolRef.current.subscribeMany(relayUrls, [filters], {
      onevent: (event: any) => {
        // Extract all `p` tags as pubkeys
        const currentMembers: string[] = event.tags
          .filter((tag: string[]) => tag?.[0] === "p" && tag[1])
          .map((tag: string[]) => tag[1])

        const now = Date.now()
        const eventTime = event.created_at * 1000 // convert from seconds
        // Convert to Set for easy diff
        const currentSet = new Set(currentMembers)

        // Notify self if joined
        if (
          userPublicKey &&
          !prevMembersRef.current.has(userPublicKey) &&
          currentSet.has(userPublicKey)
        ) {
          setMessagesMap((prevMap) => {
            const next = new Map(prevMap)
            next.set(
              `sys-joined-self-${Date.now()}`,
              makeSystemText("You joined the group"),
            )
            return next
          })
          setIsMember(true)
        }

        // Notify other new members
        // Track new members
        currentMembers.forEach((pk) => {
          if (
            pk !== userPublicKey &&
            !prevMembersRef.current.has(pk) &&
            prevMembersRef.current.size !== 0
          ) {
            const short = pk.slice(0, 6) + "…" + pk.slice(-4)
            setMessagesMap((prevMap) => {
              const next = new Map(prevMap)
              next.set(
                `sys-joined-${pk}-${Date.now()}`,
                makeSystemText(`${short} joined the group`),
              )
              return next
            })
          }
        })

        // Update prevMembersRef to exactly the current members
        prevMembersRef.current = currentSet

        // Update knownMembers state
        setKnownMembers(currentSet)
      },
    })

    return () => {
      if (unsub) unsub.close()
    }
  }, [
    poolRef?.current,
    relayUrls.join("|"),
    groupId,
    userPublicKey,
    adminPubkeys?.join("|"),
  ])

  // ----- Actions -----
  const sendMessage = useCallback(
    async (text: string) => {
      if (!poolRef?.current) throw Error("No PoolRef present")
      if (!userPublicKey) throw Error("No user pubkey present")

      const secretKey = await getSecretKey()
      if (!secretKey) throw Error("Could not get Secret Key")

      const nostrEvent = {
        kind: 9,
        created_at: Math.floor(Date.now() / 1000),
        tags: [["h", groupId, relayUrls[0]]], // include relay hint
        content: text,
        pubkey: userPublicKey,
      }

      const signedEvent = finalizeEvent(nostrEvent as any, secretKey)
      poolRef.current.publish(relayUrls, signedEvent)
    },
    [poolRef?.current, userPublicKey, groupId, relayUrls],
  )

  const requestJoin = useCallback(async () => {
    if (!poolRef?.current) throw Error("No PoolRef present")
    if (!userPublicKey) throw Error("No user pubkey present")

    const secretKey = await getSecretKey()
    if (!secretKey) throw Error("Could not get Secret Key")

    const joinEvent = {
      kind: 9021,
      created_at: Math.floor(Date.now() / 1000),
      tags: [["h", groupId]],
      content: "I'd like to join this group.",
      pubkey: userPublicKey,
    }

    const signedJoinEvent = finalizeEvent(joinEvent as any, secretKey)
    poolRef.current.publish(relayUrls, signedJoinEvent)

    // Optimistic system note
    setMessagesMap((prev) => {
      const next = new Map(prev)
      next.set(`sys-join-req-${Date.now()}`, makeSystemText("Join request sent"))
      return next
    })
  }, [poolRef?.current, userPublicKey, groupId, relayUrls])

  const value = useMemo<ContextValue>(
    () => ({
      messages,
      isMember,
      knownMembers,
      sendMessage,
      requestJoin,
      groupMetadata: metadata,
    }),
    [messages, isMember, knownMembers, sendMessage, requestJoin],
  )

  return (
    <NostrGroupChatContext.Provider value={value}>
      {children}
    </NostrGroupChatContext.Provider>
  )
}

export const useNostrGroupChat = () => {
  const ctx = useContext(NostrGroupChatContext)
  if (!ctx)
    throw new Error("useNostrGroupChat must be used inside NostrGroupChatProvider")
  return ctx
}
