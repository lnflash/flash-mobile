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
import { toastShow } from "@app/utils/toast"
import {
  NIP29_DEFAULT_RELAY_URL,
  NIP29_ROLE_BISHOP,
  NIP29_ROLE_KING,
  Nip29Role,
  nip29Log,
  nip29Warn,
} from "./constants"

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
  // Membership in the admin list (king or bishop). Kept as `isAdmin` for display.
  isAdmin: boolean
  // Can delete messages / moderate (king or bishop).
  canModerate: boolean
  // Can promote other users to a role (king only).
  isKing: boolean
  adminList: string[]
  // pubkey -> roles granted by the relay (from kind 39001).
  roleMap: Map<string, string[]>
  knownMembers: Set<string>
  sendMessage: (text: string, replyToId?: string) => Promise<void>
  requestJoin: () => Promise<void>
  removeMessage: (messageId: string) => Promise<void>
  removeMember: (pubkey: string) => Promise<void>
  addMember: (pubkey: string) => Promise<void>
  editMetadata: (metadata: GroupMetadataInput) => Promise<void>
  setRole: (pubkey: string, role: Nip29Role) => Promise<void>
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
  relayUrls = [NIP29_DEFAULT_RELAY_URL],
  adminPubkeys,
  children,
}) => {
  const { userPublicKey } = useChatContext()

  const [messagesMap, setMessagesMap] = useState<Map<string, GroupMessage>>(new Map())
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set())
  const [isMember, setIsMember] = useState(false)
  const [roleMap, setRoleMap] = useState<Map<string, string[]>>(new Map())
  const [adminList, setAdminList] = useState<string[]>([])
  const [knownMembers, setKnownMembers] = useState<Set<string>>(new Set())
  const [metadata, setMetadata] = useState<{
    name?: string
    about?: string
    picture?: string
  }>({})
  const prevMembersRef = useRef<Set<string>>(new Set())
  // Members added/removed locally that the relay's 39002 snapshot hasn't caught up
  // to yet. Applied in recompute so the roster updates immediately, and reconciled
  // away once the relay snapshot reflects the change.
  const optimisticAddedRef = useRef<Set<string>>(new Set())
  const optimisticRemovedRef = useRef<Set<string>>(new Set())

  const messages = useMemo(() => {
    return Array.from(messagesMap.values())
      .filter((m) => !deletedIds.has(m.id))
      .sort((a, b) => b.createdAt - a.createdAt)
  }, [messagesMap, deletedIds])

  // Roles for the current user, derived from the relay's 39001 admin list.
  const myRoles = useMemo(
    () => (userPublicKey ? roleMap.get(userPublicKey) ?? [] : []),
    [roleMap, userPublicKey],
  )
  const isKing = myRoles.includes(NIP29_ROLE_KING)
  const canModerate = isKing || myRoles.includes(NIP29_ROLE_BISHOP)
  // `isAdmin` = present in the admin list at all (any role). Used only for display.
  const isAdmin = !!userPublicKey && roleMap.has(userPublicKey)

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
    setRoleMap(new Map())
    setMetadata({})
    setIsMember(false)
    prevMembersRef.current = new Set()
    optimisticAddedRef.current = new Set()
    optimisticRemovedRef.current = new Set()
  }, [groupId, relayUrls.join("|")])

  // ----- Sub: group messages (kind 9) -----
  // The runtime's onEvent only fires for events NOT already cached, so messages
  // pulled by an earlier mount/subscription would never reach us via the callback.
  // Derive from the shared EventStore instead (same pattern as the 39xxx snapshots),
  // merging in any kind-9 messages we don't already have without dropping system messages.
  useEffect(() => {
    const store = nostrRuntime.getEventStore()
    const ingest = () => {
      const all = store.getAllCanonical()
      setMessagesMap((prev) => {
        let next: Map<string, GroupMessage> | null = null
        for (const event of all) {
          if (event.kind !== 9) continue
          if (!event.tags.some((t) => t[0] === "h" && t[1] === groupId)) continue
          if (prev.has(event.id)) continue
          const replyTag = event.tags.find((t) => t[0] === "e" && t[3] === "reply")
          const msg: GroupMessage = {
            id: event.id,
            authorId: event.pubkey,
            createdAt: event.created_at * 1000,
            text: event.content,
            replyToId: replyTag?.[1],
          }
          if (!next) next = new Map(prev)
          next.set(msg.id, msg)
        }
        return next ?? prev
      })
    }

    nostrRuntime.ensureSubscription(
      `nip29:messages:${groupId}`,
      { "#h": [groupId], "kinds": [9] },
      undefined,
      undefined,
      relayUrls,
    )
    const unsubscribe = store.subscribe(ingest)
    ingest()
    return unsubscribe
  }, [relayUrls.join("|"), groupId])

  // ----- Subscribe to relay snapshots (39000 metadata / 39001 admins / 39002 members) -----
  // These addressable, relay-signed events may already be cached by another
  // subscriber (e.g. the group list), in which case the runtime's onEvent never
  // fires here. So we keep the subscriptions warm and DERIVE all state from the
  // shared EventStore on every change.
  useEffect(() => {
    nostrRuntime.ensureSubscription(
      `nip29:group_metadata:${groupId}`,
      { kinds: [39000], "#d": [groupId] },
      undefined,
      undefined,
      relayUrls,
    )
    nostrRuntime.ensureSubscription(
      `nip29:membership:${groupId}`,
      { kinds: [39002], "#d": [groupId] },
      undefined,
      undefined,
      relayUrls,
    )
    nostrRuntime.ensureSubscription(
      `nip29:admins:${groupId}`,
      { kinds: [39001], "#d": [groupId] },
      undefined,
      undefined,
      relayUrls,
    )

    const store = nostrRuntime.getEventStore()
    const dTagOf = (e: Event) => e.tags.find((t) => t[0] === "d")?.[1]
    const pTags = (e: Event) => e.tags.filter((t) => t[0] === "p" && t[1])

    const recompute = () => {
      const all = store.getAllCanonical()
      const meta = all.find((e) => e.kind === 39000 && dTagOf(e) === groupId)
      const admins = all.find((e) => e.kind === 39001 && dTagOf(e) === groupId)
      const members = all.find((e) => e.kind === 39002 && dTagOf(e) === groupId)

      if (meta) {
        const result: { name?: string; about?: string; picture?: string } = {}
        for (const [key, value] of meta.tags) {
          if (key === "name") result.name = value
          else if (key === "about") result.about = value
          else if (key === "picture") result.picture = value
        }
        setMetadata(result)
      }

      if (admins) {
        const nextRoleMap = new Map<string, string[]>()
        pTags(admins).forEach((t) => nextRoleMap.set(t[1], t.slice(2)))
        setAdminList(Array.from(nextRoleMap.keys()))
        setRoleMap(nextRoleMap)
      }

      if (members) {
        const relaySet = new Set(pTags(members).map((t) => t[1]))
        // Reconcile optimistic ops: once the relay snapshot reflects them, stop forcing.
        optimisticAddedRef.current.forEach((pk) => {
          if (relaySet.has(pk)) optimisticAddedRef.current.delete(pk)
        })
        optimisticRemovedRef.current.forEach((pk) => {
          if (!relaySet.has(pk)) optimisticRemovedRef.current.delete(pk)
        })
        // Apply still-pending optimistic adds/removes on top of the relay snapshot.
        const currentSet = new Set(relaySet)
        optimisticAddedRef.current.forEach((pk) => currentSet.add(pk))
        optimisticRemovedRef.current.forEach((pk) => currentSet.delete(pk))
        // Announce a member joining only when transitioning from a known roster.
        if (prevMembersRef.current.size !== 0) {
          currentSet.forEach((pk) => {
            if (!prevMembersRef.current.has(pk)) {
              const label =
                pk === userPublicKey
                  ? "You joined the group"
                  : `${pk.slice(0, 6)}…${pk.slice(-4)} joined the group`
              setMessagesMap((prev) => {
                const next = new Map(prev)
                next.set(`sys-joined-${pk}-${Date.now()}`, makeSystemMessage(label))
                return next
              })
            }
          })
        }
        if (userPublicKey) setIsMember(currentSet.has(userPublicKey))
        prevMembersRef.current = currentSet
        setKnownMembers(currentSet)
      }
    }

    const unsubscribe = store.subscribe(recompute)
    recompute()
    return unsubscribe
  }, [groupId, relayUrls.join("|"), userPublicKey])

  // ----- Sub: deleted messages (kind 9005) -----
  // Derive from the store for the same reason as messages above (cached events
  // never reach the onEvent callback).
  useEffect(() => {
    const store = nostrRuntime.getEventStore()
    const ingest = () => {
      const all = store.getAllCanonical()
      const deleted: string[] = []
      for (const event of all) {
        if (event.kind !== 9005) continue
        if (!event.tags.some((t) => t[0] === "h" && t[1] === groupId)) continue
        const id = event.tags.find((t) => t[0] === "e")?.[1]
        if (id) deleted.push(id)
      }
      if (deleted.length === 0) return
      setDeletedIds((prev) => {
        let changed = false
        const next = new Set(prev)
        deleted.forEach((id) => {
          if (!next.has(id)) {
            next.add(id)
            changed = true
          }
        })
        return changed ? next : prev
      })
    }

    nostrRuntime.ensureSubscription(
      `nip29:deletions:${groupId}`,
      { "#h": [groupId], "kinds": [9005] },
      undefined,
      undefined,
      relayUrls,
    )
    const unsubscribe = store.subscribe(ingest)
    ingest()
    return unsubscribe
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
          nip29Warn(
            `publish failed kind=${event.kind} relay=${relayUrls[i]} reason=${msg}`,
          )
          failures.push(msg)
        } else {
          nip29Log(`publish ok kind=${event.kind} relay=${relayUrls[i]}`)
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

      // Optimistically remove from the roster; the relay's updated 39002 snapshot
      // will confirm (and recompute keeps subtracting until it does).
      optimisticAddedRef.current.delete(pubkey)
      optimisticRemovedRef.current.add(pubkey)
      setKnownMembers((prev) => {
        const next = new Set(prev)
        next.delete(pubkey)
        return next
      })

      const results = await publishEvent(signedEvent)
      const allFailed =
        results.length > 0 && results.every((r) => r.status === "rejected")
      if (allFailed) {
        // Roll back the optimistic removal so the member reappears.
        optimisticRemovedRef.current.delete(pubkey)
        setKnownMembers((prev) => new Set([...prev, pubkey]))
      }
    },
    [userPublicKey, groupId, relayUrls, publishEvent],
  )

  // Add a user to the group (NIP-29 kind 9000 put-user with just a `p` tag, no
  // role — the relay adds them as a plain member). King-only; the relay rejects
  // the event with insufficient permissions otherwise.
  const addMember = useCallback(
    async (pubkey: string) => {
      if (!userPublicKey) throw Error("No user pubkey present")
      const signer = await getSigner()
      const signedEvent = await signer.signEvent({
        kind: 9000,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
          ["h", groupId],
          ["p", pubkey],
        ],
        content: "",
        pubkey: userPublicKey,
      } as any)

      // Optimistically add to the roster; the relay's updated 39002 snapshot
      // confirms (and recompute keeps applying until it does).
      optimisticRemovedRef.current.delete(pubkey)
      optimisticAddedRef.current.add(pubkey)
      setKnownMembers((prev) => new Set([...prev, pubkey]))

      const results = await publishEvent(signedEvent)
      const allFailed = results.length > 0 && results.every((r) => r.status === "rejected")
      if (allFailed) {
        // Roll back the optimistic add.
        optimisticAddedRef.current.delete(pubkey)
        setKnownMembers((prev) => {
          const next = new Set(prev)
          next.delete(pubkey)
          return next
        })
      }
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

  // Assign a relay-recognized role (king/bishop) to a user. Requires the caller to
  // be a king; the relay rejects unauthorized role changes with insufficient permissions.
  const setRole = useCallback(
    async (pubkey: string, role: Nip29Role) => {
      if (!userPublicKey) throw Error("No user pubkey present")
      const signer = await getSigner()
      const signedEvent = await signer.signEvent({
        kind: 9000,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
          ["h", groupId],
          ["p", pubkey, role],
        ],
        content: "",
        pubkey: userPublicKey,
      } as any)
      await publishEvent(signedEvent)
    },
    [userPublicKey, groupId, relayUrls, publishEvent],
  )

  const requestJoin = useCallback(async () => {
    if (!userPublicKey) throw Error("No user pubkey present")
    const signer = await getSigner()
    nip29Log(`requestJoin invoked group=${groupId} isAdmin=${isAdmin}`)

    // Admins (king/bishop) are already members on the relay — no join request needed,
    // and we must not re-publish a 9000 that could overwrite our role.
    if (isAdmin) {
      nip29Log(`requestJoin: already admin/member, skipping join request`)
      return
    }

    const signedEvent = await signer.signEvent({
      kind: 9021,
      created_at: Math.floor(Date.now() / 1000),
      tags: [["h", groupId]],
      content: "I'd like to join this group.",
      pubkey: userPublicKey,
    } as any)
    nip29Log("join request 9021", signedEvent)
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
      canModerate,
      isKing,
      adminList,
      roleMap,
      knownMembers,
      sendMessage,
      requestJoin,
      removeMessage,
      removeMember,
      addMember,
      editMetadata,
      setRole,
      groupMetadata: metadata,
    }),
    [
      groupId,
      relayUrls,
      messages,
      isMember,
      isAdmin,
      canModerate,
      isKing,
      adminList,
      roleMap,
      knownMembers,
      sendMessage,
      requestJoin,
      removeMessage,
      removeMember,
      addMember,
      editMetadata,
      setRole,
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
