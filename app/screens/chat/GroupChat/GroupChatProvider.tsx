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
  replyToId?: string
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
  isAdmin: boolean
  adminList: string[]
  knownMembers: Set<string>
  sendMessage: (text: string, replyToId?: string) => Promise<void>
  requestJoin: () => Promise<void>
  removeMessage: (messageId: string) => Promise<void>
  removeMember: (pubkey: string) => Promise<void>
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
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set())
  const [isMember, setIsMember] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [adminList, setAdminList] = useState<string[]>([])
  const [knownMembers, setKnownMembers] = useState<Set<string>>(new Set())
  const [metadata, setMetadata] = useState<{
    name?: string
    about?: string
    picture?: string
  }>({})
  const prevMembersRef = useRef<Set<string>>(new Set())

  const messages = useMemo(() => {
    return Array.from(messagesMap.values())
      .filter((m) => !deletedIds.has(m.id))
      .sort((a, b) => b.createdAt - a.createdAt)
  }, [messagesMap, deletedIds])

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
        const replyTag = event.tags.find(
          (t: string[]) => t[0] === "e" && t[3] === "reply",
        )
        const msg: GroupMessage = {
          id: event.id,
          authorId: event.pubkey,
          createdAt: event.created_at * 1000,
          text: event.content,
          replyToId: replyTag?.[1],
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

  // ----- Sub: admin list (kind 39001) -----
  useEffect(() => {
    nostrRuntime.ensureSubscription(
      `nip29:admins`,
      { "kinds": [39001], "#d": [groupId] },
      (event: Event) => {
        const adminPubkeyList = event.tags
          .filter((t: string[]) => t[0] === "p")
          .map((t: string[]) => t[1])
        setAdminList(adminPubkeyList)
        if (userPublicKey) setIsAdmin(adminPubkeyList.includes(userPublicKey))
      },
      () => {},
      relayUrls,
    )
  }, [groupId, relayUrls.join("|"), userPublicKey])

  // ----- Sub: deleted messages (kind 9005) -----
  useEffect(() => {
    nostrRuntime.ensureSubscription(
      `nip29:deletions`,
      { "#h": [groupId], "kinds": [9005] },
      (event: Event) => {
        const deletedId = event.tags.find((t: string[]) => t[0] === "e")?.[1]
        if (deletedId) {
          setDeletedIds((prev) => {
            if (prev.has(deletedId)) return prev
            return new Set([...prev, deletedId])
          })
        }
      },
      () => {},
      relayUrls,
    )
  }, [groupId, relayUrls.join("|")])

  // ----- Actions -----
  const sendMessage = useCallback(
    async (text: string, replyToId?: string) => {
      if (!userPublicKey) throw Error("No user pubkey present")
      const signer = await getSigner()
      const tags: string[][] = [["h", groupId, relayUrls[0]]]
      if (replyToId) tags.push(["e", replyToId, relayUrls[0], "reply"])
      const signedEvent = await signer.signEvent({
        kind: 9,
        created_at: Math.floor(Date.now() / 1000),
        tags,
        content: text,
        pubkey: userPublicKey,
      } as any)
      pool.publish(relayUrls, signedEvent)
    },
    [userPublicKey, groupId, relayUrls],
  )

  const removeMessage = useCallback(
    async (messageId: string) => {
      if (!userPublicKey) return
      const signer = await getSigner()
      const signedEvent = await signer.signEvent({
        kind: 9005,
        created_at: Math.floor(Date.now() / 1000),
        tags: [["h", groupId], ["e", messageId]],
        content: "",
        pubkey: userPublicKey,
      } as any)
      pool.publish(relayUrls, signedEvent)
      // Optimistically remove locally
      setDeletedIds((prev) => new Set([...prev, messageId]))
    },
    [userPublicKey, groupId, relayUrls],
  )

  const removeMember = useCallback(
    async (pubkey: string) => {
      if (!userPublicKey) return
      const signer = await getSigner()
      const signedEvent = await signer.signEvent({
        kind: 9001,
        created_at: Math.floor(Date.now() / 1000),
        tags: [["h", groupId], ["p", pubkey]],
        content: "",
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
    () => ({
      messages,
      isMember,
      isAdmin,
      adminList,
      knownMembers,
      sendMessage,
      requestJoin,
      removeMessage,
      removeMember,
      groupMetadata: metadata,
    }),
    [messages, isMember, isAdmin, adminList, knownMembers, sendMessage, requestJoin, removeMessage, removeMember, metadata],
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
