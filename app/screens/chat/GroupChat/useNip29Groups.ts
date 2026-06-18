import { useEffect, useRef, useState } from "react"
import { Event } from "nostr-tools"
import { nostrRuntime } from "@app/nostr/runtime/NostrRuntime"
import { NIP29_DEFAULT_RELAY_URL } from "./constants"

export type Nip29GroupSummary = {
  groupId: string
  name?: string
  about?: string
  picture?: string
  isAdmin: boolean
}

const dTag = (event: Event) => event.tags.find((t) => t[0] === "d")?.[1]
const hasPTag = (event: Event, pubkey: string) =>
  event.tags.some((t) => t[0] === "p" && t[1] === pubkey)

const parseMetadata = (event?: Event) => {
  const meta: { name?: string; about?: string; picture?: string } = {}
  if (!event) return meta
  for (const [k, v] of event.tags) {
    if (k === "name") meta.name = v
    else if (k === "about") meta.about = v
    else if (k === "picture") meta.picture = v
  }
  return meta
}

/**
 * Lists the NIP-29 groups the user belongs to, discovered from the relay's
 * relay-signed snapshots: 39001 (admins) for groups they administer and 39002
 * (members) for groups they're in. The creator of a group is auto-added as a
 * member, so created groups show up here too. Reads are public on the relay, so
 * no auth is required. Group names/pictures come from each group's 39000 event.
 */
export const useNip29Groups = (
  userPublicKey?: string,
  relayUrls: string[] = [NIP29_DEFAULT_RELAY_URL],
): Nip29GroupSummary[] => {
  const [groups, setGroups] = useState<Nip29GroupSummary[]>([])
  const metaSubscribed = useRef<Set<string>>(new Set())
  const relayKey = relayUrls.join("|")

  useEffect(() => {
    if (!userPublicKey) {
      setGroups([])
      return
    }

    const store = nostrRuntime.getEventStore()

    const recompute = () => {
      const all = store.getAllCanonical()
      // Group ids where I'm an admin (39001) or a member (39002).
      const adminGroupIds = new Set<string>()
      const memberGroupIds = new Set<string>()
      for (const event of all) {
        if (event.kind === 39001 && hasPTag(event, userPublicKey)) {
          const id = dTag(event)
          if (id) adminGroupIds.add(id)
        } else if (event.kind === 39002 && hasPTag(event, userPublicKey)) {
          const id = dTag(event)
          if (id) memberGroupIds.add(id)
        }
      }

      const allIds = new Set<string>([...adminGroupIds, ...memberGroupIds])

      // Ensure a metadata subscription for any newly discovered group.
      for (const id of allIds) {
        if (!metaSubscribed.current.has(id)) {
          metaSubscribed.current.add(id)
          nostrRuntime.ensureSubscription(
            `nip29:list_meta:${id}`,
            { kinds: [39000], "#d": [id] },
            undefined,
            undefined,
            relayUrls,
          )
        }
      }

      const next: Nip29GroupSummary[] = Array.from(allIds).map((id) => ({
        groupId: id,
        isAdmin: adminGroupIds.has(id),
        ...parseMetadata(findMetadata(all, id)),
      }))

      next.sort((a, b) => (a.name || a.groupId).localeCompare(b.name || b.groupId))
      setGroups(next)
    }

    // Subscribe to relay snapshots that reveal our groups.
    nostrRuntime.ensureSubscription(
      `nip29:my_admin_groups:${userPublicKey}`,
      { kinds: [39001], "#p": [userPublicKey] },
      undefined,
      undefined,
      relayUrls,
    )
    nostrRuntime.ensureSubscription(
      `nip29:my_member_groups:${userPublicKey}`,
      { kinds: [39002], "#p": [userPublicKey] },
      undefined,
      undefined,
      relayUrls,
    )

    // Recompute from the store now and whenever it changes.
    const unsubscribe = store.subscribe(recompute)
    recompute()
    return unsubscribe
  }, [userPublicKey, relayKey])

  return groups
}

// 39000 is relay-signed; we don't know the relay pubkey up front, so find the
// metadata event for a group by scanning the canonical snapshot.
const findMetadata = (all: Event[], groupId: string): Event | undefined =>
  all.find((e) => e.kind === 39000 && dTag(e) === groupId)

/** Subscribe to a single group's 39000 metadata (name/about/picture). */
export const useNip29GroupMetadata = (
  groupId: string,
  relayUrls: string[] = [NIP29_DEFAULT_RELAY_URL],
): { name?: string; about?: string; picture?: string } => {
  const [meta, setMeta] = useState<{ name?: string; about?: string; picture?: string }>({})
  const relayKey = relayUrls.join("|")

  useEffect(() => {
    const store = nostrRuntime.getEventStore()
    const recompute = () => setMeta(parseMetadata(findMetadata(store.getAllCanonical(), groupId)))
    nostrRuntime.ensureSubscription(
      `nip29:list_meta:${groupId}`,
      { kinds: [39000], "#d": [groupId] },
      undefined,
      undefined,
      relayUrls,
    )
    const unsubscribe = store.subscribe(recompute)
    recompute()
    return unsubscribe
  }, [groupId, relayKey])

  return meta
}
