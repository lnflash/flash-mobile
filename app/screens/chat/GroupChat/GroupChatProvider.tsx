import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { Event, generateSecretKey } from "nostr-tools"
import { bytesToHex } from "@noble/hashes/utils"
import { getSigner } from "@app/nostr/signer"
import { useChatContext } from "../../../screens/chat/chatContext"
import { nostrRuntime } from "@app/nostr/runtime/NostrRuntime"
import { pool } from "@app/utils/nostr/pool"
import { toastShow } from "@app/utils/toast"

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

export type GroupMetadataInput = {
  name?: string
  about?: string
  picture?: string
}

type ContextValue = {
  groupId: string
  relayUrls: string[]
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
  editMetadata: (metadata: GroupMetadataInput) => Promise<void>
  addAdmin: (pubkey: string) => Promise<void>
  createGroup: (metadata: GroupMetadataInput) => Promise<string>
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

  // Reset all group-scoped state when the active group changes
  useEffect(() => {
    setMessagesMap(new Map())
    setDeletedIds(new Set())
    setKnownMembers(new Set())
    setAdminList([])
    setMetadata({})
    setIsMember(false)
    setIsAdmin(false)
    prevMembersRef.current = new Set()
  }, [groupId, relayUrls.join("|")])

  // ----- Sub: group messages (kind 9) -----
  useEffect(() => {
    nostrRuntime.ensureSubscription(
      `nip29:messages:${groupId}`,
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
    console.log(`[nip29] subscribe metadata group=${groupId} relays=${relayUrls.join(",")}`)
    nostrRuntime.ensureSubscription(
      `nip29:group_metadata:${groupId}`,
      { "kinds": [39000], "#d": [groupId] },
      (event: Event) => {
        console.log(`[nip29] recv 39000 metadata`, { tags: event.tags })
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
      `nip29:membership:${groupId}`,
      filters,
      (event: any) => {
        const currentMembers: string[] = event.tags
          .filter((tag: string[]) => tag?.[0] === "p" && tag[1])
          .map((tag: string[]) => tag[1])
        console.log(`[nip29] recv 39002 members count=${currentMembers.length} group=${groupId}`)

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
      `nip29:admins:${groupId}`,
      { "kinds": [39001], "#d": [groupId] },
      (event: Event) => {
        const adminPubkeyList = event.tags
          .filter((t: string[]) => t[0] === "p")
          .map((t: string[]) => t[1])
        console.log(
          `[nip29] recv 39001 admins count=${adminPubkeyList.length} group=${groupId} includesMe=${
            !!userPublicKey && adminPubkeyList.includes(userPublicKey)
          }`,
        )
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
      `nip29:deletions:${groupId}`,
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

  // Publish an event to the configured relays, responding to NIP-42 AUTH challenges.
  // Surfaces errors via console so silent drops become visible during dev.
  const publishEvent = useCallback(
    async (event: any) => {
      const signer = await getSigner()
      const results = await Promise.allSettled(
        pool.publish(relayUrls, event, {
          onauth: async (template: any) => {
            const signed = await signer.signEvent({
              ...template,
              pubkey: userPublicKey,
            } as any)
            return signed as any
          },
        }),
      )
      const failures: string[] = []
      results.forEach((r, i) => {
        if (r.status === "rejected") {
          const msg = r.reason?.message || String(r.reason)
          console.warn(
            `[nip29] publish failed kind=${event.kind} relay=${relayUrls[i]} reason=${msg}`,
          )
          failures.push(msg)
        } else {
          console.log(`[nip29] publish ok kind=${event.kind} relay=${relayUrls[i]}`)
        }
      })
      if (failures.length && failures.length === results.length) {
        toastShow({
          type: "error",
          message: `Publish kind ${event.kind} failed: ${failures[0]}`,
        })
      }
      return results
    },
    [userPublicKey, relayUrls],
  )

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
      await publishEvent(signedEvent)
    },
    [userPublicKey, groupId, relayUrls, publishEvent],
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
      await publishEvent(signedEvent)
      // Optimistically remove locally
      setDeletedIds((prev) => new Set([...prev, messageId]))
    },
    [userPublicKey, groupId, relayUrls, publishEvent],
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
      await publishEvent(signedEvent)
    },
    [userPublicKey, groupId, relayUrls, publishEvent],
  )

  const editMetadata = useCallback(
    async (metadata: GroupMetadataInput) => {
      if (!userPublicKey) throw Error("No user pubkey present")
      const signer = await getSigner()
      const tags: string[][] = [["h", groupId]]
      if (metadata.name !== undefined) tags.push(["name", metadata.name])
      if (metadata.about !== undefined) tags.push(["about", metadata.about])
      if (metadata.picture !== undefined) tags.push(["picture", metadata.picture])
      const signedEvent = await signer.signEvent({
        kind: 9002,
        created_at: Math.floor(Date.now() / 1000),
        tags,
        content: "",
        pubkey: userPublicKey,
      } as any)
      await publishEvent(signedEvent)
    },
    [userPublicKey, groupId, relayUrls, publishEvent],
  )

  const addAdmin = useCallback(
    async (pubkey: string) => {
      if (!userPublicKey) throw Error("No user pubkey present")
      const signer = await getSigner()
      const signedEvent = await signer.signEvent({
        kind: 9000,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
          ["h", groupId],
          ["p", pubkey, "admin"],
        ],
        content: "",
        pubkey: userPublicKey,
      } as any)
      await publishEvent(signedEvent)
    },
    [userPublicKey, groupId, relayUrls, publishEvent],
  )

  const createGroup = useCallback(
    async (metadata: GroupMetadataInput): Promise<string> => {
      if (!userPublicKey) throw Error("No user pubkey present")
      const signer = await getSigner()
      const newGroupId = bytesToHex(generateSecretKey().slice(0, 8))

      const createEvent = await signer.signEvent({
        kind: 9007,
        created_at: Math.floor(Date.now() / 1000),
        tags: [["h", newGroupId]],
        content: "",
        pubkey: userPublicKey,
      } as any)
      await publishEvent(createEvent)

      const metaTags: string[][] = [["h", newGroupId]]
      if (metadata.name !== undefined) metaTags.push(["name", metadata.name])
      if (metadata.about !== undefined) metaTags.push(["about", metadata.about])
      if (metadata.picture !== undefined) metaTags.push(["picture", metadata.picture])
      if (metaTags.length > 1) {
        const metaEvent = await signer.signEvent({
          kind: 9002,
          created_at: Math.floor(Date.now() / 1000) + 1,
          tags: metaTags,
          content: "",
          pubkey: userPublicKey,
        } as any)
        await publishEvent(metaEvent)
      }

      // Add the creator as an admin member (relay only auto-adds to admins, not members)
      const addSelfEvent = await signer.signEvent({
        kind: 9000,
        created_at: Math.floor(Date.now() / 1000) + 2,
        tags: [
          ["h", newGroupId],
          ["p", userPublicKey, "admin"],
        ],
        content: "",
        pubkey: userPublicKey,
      } as any)
      await publishEvent(addSelfEvent)

      return newGroupId
    },
    [userPublicKey, relayUrls, publishEvent],
  )

  const requestJoin = useCallback(async () => {
    if (!userPublicKey) throw Error("No user pubkey present")
    const signer = await getSigner()
    console.log(`[nip29] requestJoin invoked group=${groupId} isAdmin=${isAdmin}`)

    // If we're already an admin, skip the join-request flow and self-add directly.
    if (isAdmin) {
      const addSelfEvent = await signer.signEvent({
        kind: 9000,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
          ["h", groupId],
          ["p", userPublicKey, "admin"],
        ],
        content: "",
        pubkey: userPublicKey,
      } as any)
      console.log(`[nip29] self-add 9000`, addSelfEvent)
      await publishEvent(addSelfEvent)
      return
    }

    const signedEvent = await signer.signEvent({
      kind: 9021,
      created_at: Math.floor(Date.now() / 1000),
      tags: [["h", groupId]],
      content: "I'd like to join this group.",
      pubkey: userPublicKey,
    } as any)
    console.log(`[nip29] join request 9021`, signedEvent)
    await publishEvent(signedEvent)

    setMessagesMap((prev) => {
      const next = new Map(prev)
      next.set(`sys-join-req-${Date.now()}`, makeSystemMessage("Join request sent"))
      return next
    })
  }, [userPublicKey, groupId, relayUrls, isAdmin, publishEvent])

  const value = useMemo<ContextValue>(
    () => ({
      groupId,
      relayUrls,
      messages,
      isMember,
      isAdmin,
      adminList,
      knownMembers,
      sendMessage,
      requestJoin,
      removeMessage,
      removeMember,
      editMetadata,
      addAdmin,
      createGroup,
      groupMetadata: metadata,
    }),
    [
      groupId,
      relayUrls,
      messages,
      isMember,
      isAdmin,
      adminList,
      knownMembers,
      sendMessage,
      requestJoin,
      removeMessage,
      removeMember,
      editMetadata,
      addAdmin,
      createGroup,
      metadata,
    ],
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
