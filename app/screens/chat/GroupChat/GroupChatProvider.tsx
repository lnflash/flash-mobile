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
import { MessageType } from "@flyerhq/react-native-chat-ui"
import { getSigner } from "@app/nostr/signer"
import { useChatContext } from "../../../screens/chat/chatContext"
import { nostrRuntime } from "@app/nostr/runtime/NostrRuntime"
import { pool } from "@app/utils/nostr/pool"

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
  const { userPublicKey } = useChatContext()

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

  // Sync isMember when userPublicKey becomes available after membership data was already received
  useEffect(() => {
    if (userPublicKey && knownMembers.size > 0) {
      setIsMember(knownMembers.has(userPublicKey))
    }
  }, [userPublicKey, knownMembers])

  // ----- Sub: group messages (kind 9) -----
  useEffect(() => {
    nostrRuntime.ensureSubscription(
      `nip29:messages`,

      {
        "#h": [groupId],
        "kinds": [9],
      },
      (event: Event) => {
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
      () => {},
      relayUrls,
    )
  }, [relayUrls.join("|"), groupId])

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
    const unsub = nostrRuntime.ensureSubscription(
      `nip29:group_metadata`,
      { "kinds": [39000], "#d": [groupId] },
      (event) => {
        console.log("==============GOT METADATA EVENT=============")
        const parsed = parseGroupTags(event.tags)
        setMetadata(parsed)
      },
      () => {
        console.log("EOSE TRIGGERED FOR ", 39000)
      },
      relayUrls,
    )
  }, [groupId])

  // ----- Sub: membership roster (kind 39002) -----
  useEffect(() => {
    const filters: any = {
      "kinds": [39002],
      "#d": [groupId],
    }
    if (adminPubkeys?.length) filters.authors = adminPubkeys

    const unsub = nostrRuntime.ensureSubscription(
      `nip29:membership`,
      filters,
      (event: any) => {
        // Extract all `p` tags as pubkeys
        console.log("==============GOT MEMBERSHIP EVENT=============")
        const currentMembers: string[] = event.tags
          .filter((tag: string[]) => tag?.[0] === "p" && tag[1])
          .map((tag: string[]) => tag[1])

        // Convert to Set for easy diff
        const currentSet = new Set(currentMembers)

        // Notify self if just joined (transition only – for the system message)
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
        }

        // Always sync isMember with the current roster
        if (userPublicKey) {
          setIsMember(currentSet.has(userPublicKey))
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
      () => {},
      relayUrls,
    )
  }, [relayUrls.join("|"), groupId, userPublicKey, adminPubkeys?.join("|")])

  // ----- Actions -----
  const sendMessage = useCallback(
    async (text: string) => {
      if (!userPublicKey) throw Error("No user pubkey present")

      const signer = await getSigner()

      const nostrEvent = {
        kind: 9,
        created_at: Math.floor(Date.now() / 1000),
        tags: [["h", groupId, relayUrls[0]]], // include relay hint
        content: text,
        pubkey: userPublicKey,
      }

      const signedEvent = await signer.signEvent(nostrEvent as any)
      pool.publish(relayUrls, signedEvent)
    },
    [userPublicKey, groupId, relayUrls],
  )

  const requestJoin = useCallback(async () => {
    if (!userPublicKey) throw Error("No user pubkey present")

    const signer = await getSigner()

    const joinEvent = {
      kind: 9021,
      created_at: Math.floor(Date.now() / 1000),
      tags: [["h", groupId]],
      content: "I'd like to join this group.",
      pubkey: userPublicKey,
    }

    const signedJoinEvent = await signer.signEvent(joinEvent as any)
    pool.publish(relayUrls, signedJoinEvent)

    // Optimistic system note
    setMessagesMap((prev) => {
      const next = new Map(prev)
      next.set(`sys-join-req-${Date.now()}`, makeSystemText("Join request sent"))
      return next
    })
  }, [userPublicKey, groupId, relayUrls])

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
