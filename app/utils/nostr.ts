import { getContactsFromEvent } from "@app/screens/chat/utils"
import { bytesToHex } from "@noble/curves/abstract/utils"
import AsyncStorage from "@react-native-async-storage/async-storage"
import {
  UnsignedEvent,
  finalizeEvent,
  generateSecretKey,
  getEventHash,
  Event,
  nip19,
  nip44,
  Relay,
  SimplePool,
  Filter,
  SubCloser,
  AbstractRelay,
} from "nostr-tools"

import * as Keychain from "react-native-keychain"
import { pool } from "./nostr/pool"
import type { NostrSigner } from "@app/nostr/signer/types"

export const publicRelays = [
  "wss://relay.damus.io",
  "wss://relay.primal.net",
  "wss://relay.snort.social",
  "wss//nos.lol",
]

const KEYCHAIN_NOSTRCREDS_KEY = "nostr_creds_key"

const now = () => Math.round(Date.now() / 1000)
export type Rumor = UnsignedEvent & { id: string }
export type Group = { subject: string; participants: string[] }

export const createRumor = async (
  event: Partial<UnsignedEvent>,
  signer: NostrSigner,
): Promise<Rumor> => {
  const rumor = {
    created_at: now(),
    content: "",
    tags: [],
    ...event,
    pubkey: await signer.getPublicKey(),
  } as any

  rumor.id = getEventHash(rumor)

  return rumor as Rumor
}

export const createSeal = async (
  rumor: Rumor,
  signer: NostrSigner,
  recipientPublicKey: string,
): Promise<Event> => {
  const ciphertext = await signer.nip44.encrypt(recipientPublicKey, JSON.stringify(rumor))
  return signer.signEvent({
    kind: 13,
    content: ciphertext,
    created_at: now(),
    tags: [],
  })
}

export const createWrap = (event: Event, recipientPublicKey: string) => {
  const randomKey = generateSecretKey()
  const conversationKey = nip44.v2.utils.getConversationKey(
    bytesToHex(randomKey),
    recipientPublicKey,
  )
  const ciphertext = nip44.v2.encrypt(JSON.stringify(event), conversationKey)
  return finalizeEvent(
    {
      kind: 1059,
      content: ciphertext,
      created_at: now(),
      tags: [["p", recipientPublicKey]],
    },
    randomKey,
  ) as Event
}

export const getRumorFromWrap = async (
  wrapEvent: Event,
  signer: NostrSigner,
): Promise<Rumor> => {
  const sealString = await signer.nip44.decrypt(wrapEvent.pubkey, wrapEvent.content)
  const seal = JSON.parse(sealString) as Event
  const rumorString = await signer.nip44.decrypt(seal.pubkey, seal.content)
  return JSON.parse(rumorString)
}

export const fetchSecretFromLocalStorage = async () => {
  let credentials = await Keychain.getInternetCredentials(KEYCHAIN_NOSTRCREDS_KEY)
  return credentials ? credentials.password : null
}

export const fetchGiftWrapsForPublicKey = (
  pubkey: string,
  eventHandler: (event: Event) => void,
  pool: SimplePool,
  since?: number,
) => {
  let filter: Filter = {
    "kinds": [1059],
    "#p": [pubkey],
    "limit": 150,
  }
  if (since) filter.since = since
  let closer = pool.subscribeMany(
    ["wss://relay.flashapp.me", "wss://relay.damus.io", "wss://nostr.oxtr.dev"],
    [filter],
    {
      onevent: eventHandler,
      onclose: () => {
        closer.close()
        console.log("Re-establishing connection")
        closer = fetchGiftWrapsForPublicKey(pubkey, eventHandler, pool)
      },
    },
  )
  return closer
}

export const convertRumorsToGroups = (rumors: Rumor[]) => {
  let groups: Map<string, Rumor[]> = new Map()
  rumors.forEach((rumor) => {
    let participants = rumor.tags.filter((t) => t[0] === "p").map((p) => p[1])
    let id = getGroupId([...participants, rumor.pubkey])
    groups.set(id, [...(groups.get(id) || []), rumor])
  })
  return groups
}

export const getGroupId = (participantsHex: string[]) => {
  const participantsSet = new Set(participantsHex)
  let participants = Array.from(participantsSet)
  participants.sort()
  let id = participants.join(",")
  return id
}

/** @deprecated Use getSigner() from @app/nostr/signer instead */
export const getSecretKey = async () => {
  let secretKeyString = await fetchSecretFromLocalStorage()
  if (!secretKeyString) {
    return null
  }
  let secret = nip19.decode(secretKeyString).data as Uint8Array
  return secret
}

export const fetchNostrUsers = (
  pubKeys: string[],
  handleProfileEvent: (event: Event, closer: SubCloser) => void,
) => {
  const closer = pool.subscribeMany(
    publicRelays,
    [
      {
        kinds: [0],
        authors: pubKeys,
      },
    ],
    {
      onevent: (event: Event) => {
        handleProfileEvent(event, closer)
      },
      onclose: () => {
        closer.close()
      },
      oneose: () => {
        closer.close()
      },
    },
  )
  return closer
}

export const fetchPreferredRelays = async (pubKeys: string[]) => {
  let filter: Filter = {
    kinds: [10050],
    authors: pubKeys,
  }
  let relayEvents = await pool.querySync(publicRelays, filter)
  let relayMap = new Map<string, string[]>()
  relayEvents.forEach((event) => {
    relayMap.set(
      event.pubkey,
      event.tags.filter((t) => t[0] === "relay").map((t) => t[1]),
    )
  })
  return relayMap
}

export const sendNIP4Message = async (_message: string, _recipient: string) => {
  // TODO: implement NIP-04 via signer.nip04
}

export const fetchContactList = async (
  userPubkey: string,
  onEvent: (event: Event) => void,
) => {
  let filter = {
    kinds: [3],
    authors: [userPubkey],
  }
  pool.subscribeMany(
    ["wss://relay.damus.io", "wss://relay.prmal.net", "wss://nos.lol"],
    [filter],
    {
      onevent: onEvent,
      onclose: () => {
        console.log("Closing Subscription for Contacts")
      },
      oneose: () => {
        console.log("EOSE RECEIVED, DID SUBSCRIPTION CLOSE?")
      },
    },
  )
}

export const setPreferredRelay = async (signer: NostrSigner) => {
  const pubKey = await signer.getPublicKey()
  const relayEvent: UnsignedEvent = {
    pubkey: pubKey,
    tags: [
      ["relay", "wss://relay.flashapp.me"],
      ["relay", "wss://relay.damus.io"],
      ["relay", "wss://relay.primal.net"],
    ],
    created_at: now(),
    kind: 10050,
    content: "",
  }
  const finalEvent = await signer.signEvent(relayEvent)
  let messages = await Promise.allSettled(pool.publish(publicRelays, finalEvent))
  console.log("Message from relays", messages)
  setTimeout(() => {
    pool.close(publicRelays)
  }, 5000)
}

export const addToContactList = async (
  signer: NostrSigner,
  hexPubKeyToAdd: string,
  confirmOverwrite: () => Promise<boolean>,
  contactsEvent?: Event,
) => {
  const userPubkey = await signer.getPublicKey()
  const existingContacts = contactsEvent ? getContactsFromEvent(contactsEvent) : []
  const tags = contactsEvent?.tags || []

  if (existingContacts.some((p: NostrProfile) => p.pubkey === hexPubKeyToAdd)) {
    console.log("Contact already in list.")
    return
  }

  if (!contactsEvent) {
    const confirmed = await confirmOverwrite()
    if (!confirmed) {
      console.log("User declined to create a new contact list.")
      return
    }
  }

  tags.push(["p", hexPubKeyToAdd])
  const newEvent: UnsignedEvent = {
    kind: 3,
    pubkey: userPubkey,
    content: contactsEvent?.content || "",
    created_at: Math.floor(Date.now() / 1000),
    tags,
  }

  const finalNewEvent = await signer.signEvent(newEvent)
  const messages = await Promise.allSettled(
    pool.publish(
      ["wss://relay.damus.io", "wss://relay.primal.net", "wss://nos.lol"],
      finalNewEvent,
    ),
  )

  console.log("Contact Publish: Relay replies", messages)
}

export async function sendNip17Message(
  recipients: string[],
  message: string,
  preferredRelaysMap: Map<string, string[]>,
  signer: NostrSigner,
  onSent?: (rumor: Rumor) => void,
) {
  let p_tags = recipients.map((recipientId: string) => ["p", recipientId])
  let rumor = await createRumor({ content: message, kind: 14, tags: p_tags }, signer)
  let outputs: { acceptedRelays: string[]; rejectedRelays: string[] }[] = []
  console.log("total recipients", recipients)
  await Promise.allSettled(
    recipients.map(async (recipientId: string) => {
      console.log("sending rumor for recipient ", recipientId)
      let recipientAcceptedRelays: string[] = []
      let recipientRelays = preferredRelaysMap.get(recipientId)
      recipientRelays = [
        ...(recipientRelays || [
          "wss://relay.flashapp.me",
          "wss://relay.damus.io",
          "wss://nostr.oxtr.dev",
        ]),
      ]
      let seal = await createSeal(rumor, signer, recipientId)
      let wrap = createWrap(seal, recipientId)
      console.log("wrap created")
      try {
        let response = await Promise.allSettled(
          customPublish(
            recipientRelays,
            wrap,
            (url: string) => {
              console.log("Accepted relay callback triggered:", url)
              onSent?.(rumor)
              recipientAcceptedRelays.push(url)
            },
            (url: string) => {
              console.log("Rejected relay:", url)
            },
          ),
        )
      } catch (e) {
        console.log("error in publishing", e)
      }
      outputs.push({ acceptedRelays: recipientAcceptedRelays, rejectedRelays: [] })
    }),
  )
  console.log("Final output is", outputs)
  return { outputs, rumor }
}

export const ensureRelay = async (
  url: string,
  params?: { connectionTimeout?: number },
): Promise<AbstractRelay> => {
  url = normalizeURL(url)

  let relay = new Relay(url)
  if (params?.connectionTimeout) relay.connectionTimeout = params.connectionTimeout
  await relay.connect()

  return relay
}

export const customPublish = (
  relays: string[],
  event: Event,
  onAcceptedRelays?: (url: string) => void,
  onRejectedRelays?: (url: string) => void,
): Promise<string>[] => {
  console.log("Custom publish invoked ")
  const timeoutPromise = (url: string): Promise<string> =>
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Publish to ${url} timed out`)), 2000)
    })

  return relays.map(normalizeURL).map(async (url, i, arr) => {
    console.log("trying to publish to", url)
    if (arr.indexOf(url) !== i) {
      return Promise.reject("duplicate url")
    }
    return Promise.race([
      (async () => {
        let r = await ensureRelay(url)
        return r.publish(event).then(
          (value) => {
            console.log("Accepted on", url)
            onAcceptedRelays?.(url)
            return value
          },
          (reason: string) => {
            console.log("Rejected on", url)
            onRejectedRelays?.(url)
            return reason
          },
        )
      })(),
      timeoutPromise(url),
    ])
  })
}

function normalizeURL(url: string) {
  if (url.indexOf("://") === -1) url = "wss://" + url
  let p = new URL(url)
  p.pathname = p.pathname.replace(/\/+/g, "/")
  if (p.pathname.endsWith("/")) p.pathname = p.pathname.slice(0, -1)
  if (
    (p.port === "80" && p.protocol === "ws:") ||
    (p.port === "443" && p.protocol === "wss:")
  )
    p.port = ""
  p.searchParams.sort()
  p.hash = ""
  return p.toString()
}

export const loadGiftwrapsFromStorage = async () => {
  try {
    const savedGiftwraps = await AsyncStorage.getItem("giftwraps")
    return savedGiftwraps ? (JSON.parse(savedGiftwraps) as Event[]) : []
  } catch (e) {
    console.error("Error loading giftwraps from storage:", e)
    return []
  }
}

export const saveGiftwrapsToStorage = async (giftwraps: Event[]) => {
  try {
    await AsyncStorage.setItem("giftwraps", JSON.stringify(giftwraps))
  } catch (e) {
    console.error("Error saving giftwraps to storage:", e)
  }
}

export const createContactListEvent = async (signer: NostrSigner) => {
  const selfPublicKey = await signer.getPublicKey()
  const event: UnsignedEvent = {
    kind: 3,
    tags: [["p", selfPublicKey]],
    content: "",
    created_at: Math.floor(Date.now() / 1000),
    pubkey: selfPublicKey,
  }
  const signedEvent = await signer.signEvent(event)
  const messages = await Promise.allSettled(
    pool.publish(
      ["wss://relay.damus.io", "wss://relay.primal.net", "wss://nos.lol"],
      signedEvent,
    ),
  )
  console.log("Message from relays for contact list publish", messages)
}
