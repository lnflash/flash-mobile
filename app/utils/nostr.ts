import { bytesToHex } from "@noble/curves/abstract/utils"
import {
  UnsignedEvent,
  finalizeEvent,
  generateSecretKey,
  getEventHash,
  getPublicKey,
  Event,
  nip19,
  nip44,
  Relay,
  SimplePool,
  Filter,
  SubCloser,
} from "nostr-tools"
import { Alert } from "react-native"

import * as Keychain from "react-native-keychain"

let publicRelays = [
  "wss://relay.damus.io",
  "wss://relay.primal.net",
  "wss://relay.staging.flashapp.me",
  "wss://relay.snort.social",
  "wss//nos.lol",
]

const KEYCHAIN_NOSTRCREDS_KEY = "nostr_creds_key"

const now = () => Math.round(Date.now() / 1000)
export type Rumor = UnsignedEvent & { id: string }
export type Group = { subject: string; participants: string[] }

export const createRumor = (event: Partial<UnsignedEvent>, privateKey: Uint8Array) => {
  const rumor = {
    created_at: now(),
    content: "",
    tags: [],
    ...event,
    pubkey: getPublicKey(privateKey),
  } as any

  rumor.id = getEventHash(rumor)

  return rumor as Rumor
}

function encrypNip44Message(
  privateKey: Uint8Array,
  message: string,
  receiverPublicKey: string,
) {
  let conversationKey = nip44.v2.utils.getConversationKey(
    bytesToHex(privateKey),
    receiverPublicKey,
  )
  let ciphertext = nip44.v2.encrypt(message, conversationKey)
  return ciphertext
}

export const createSeal = (
  rumor: Rumor,
  privateKey: Uint8Array,
  recipientPublicKey: string,
) => {
  return finalizeEvent(
    {
      kind: 13,
      content: encrypNip44Message(privateKey, JSON.stringify(rumor), recipientPublicKey),
      created_at: now(),
      tags: [],
    },
    privateKey,
  ) as Event
}

export const createWrap = (event: Event, recipientPublicKey: string) => {
  const randomKey = generateSecretKey()
  return finalizeEvent(
    {
      kind: 1059,
      content: encrypNip44Message(randomKey, JSON.stringify(event), recipientPublicKey),
      created_at: now(),
      tags: [["p", recipientPublicKey]],
    },
    randomKey,
  ) as Event
}

export const decryptNip44Message = (
  cipher: string,
  publicKey: string,
  privateKey: Uint8Array,
) => {
  let conversationKey = nip44.v2.utils.getConversationKey(
    bytesToHex(privateKey),
    publicKey,
  )
  let message = nip44.v2.decrypt(cipher, conversationKey)
  return message
}

export const getRumorFromWrap = (wrapEvent: Event, privateKey: Uint8Array) => {
  let sealString = decryptNip44Message(wrapEvent.content, wrapEvent.pubkey, privateKey)
  let seal = JSON.parse(sealString) as Event
  let rumorString = decryptNip44Message(seal.content, seal.pubkey, privateKey)
  let rumor = JSON.parse(rumorString)
  return rumor
}

export const fetchSecretFromLocalStorage = async () => {
  let credentials = await Keychain.getInternetCredentials(KEYCHAIN_NOSTRCREDS_KEY)
  return credentials ? credentials.password : null
}

export const fetchGiftWrapsForPublicKey = async (
  pubkey: string,
  eventHandler: (event: Event) => void,
  pool: SimplePool,
) => {
  let closer = pool.subscribeMany(
    ["wss://relay.staging.flashapp.me"],
    [
      {
        "kinds": [1059],
        "#p": [pubkey],
        "limit": 150,
      },
    ],
    {
      onevent: eventHandler,
    },
  )
  return closer
}

export const convertRumorsToGroups = (rumors: Rumor[]) => {
  let groups: Map<string, Rumor[]> = new Map()
  rumors.forEach((rumor) => {
    let participants = rumor.tags.filter((t) => t[0] === "p").map((p) => p[1])
    let participantsSet = new Set([...participants, rumor.pubkey])
    participants = Array.from(participantsSet)
    participants.sort()
    let id = participants.join(",")
    groups.set(id, [...(groups.get(id) || []), rumor])
  })
  return groups
}

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
  pool: SimplePool,
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

export const fetchPreferredRelays = async (pubKeys: string[], pool: SimplePool) => {
  let publicRelays = [
    "wss://relay.damus.io",
    "wss://relay.primal.net",
    "wss://relay.staging.flashapp.me",
    "wss://relay.snort.social",
    "wss//nos.lol",
  ]
  let filter: Filter = {
    kinds: [10050],
    authors: pubKeys,
  }
  let relayEvents = await pool.querySync(publicRelays, filter)
  let relayMap = new Map<string, Event>()
  relayEvents.forEach((event) => {
    relayMap.set(event.pubkey, event)
  })
  return relayMap
}

export const sendNIP4Message = async (message: string, recipient: string) => {
  let privateKey = await getSecretKey()
  let NIP4Messages = {}
}

export const setPreferredRelay = async () => {
  console.log("inside setpreferredRelay")
  const secret = await getSecretKey()
  if (!secret) {
    Alert.alert("Nostr Private Key Not Assigned")
    return
  }
  const pubKey = getPublicKey(secret)
  let relayEvent: UnsignedEvent = {
    pubkey: pubKey,
    tags: [["relay", "wss://relay.staging.flashapp.me"]],
    created_at: now(),
    kind: 10050,
    content: "",
  }
  console.log("Prepared preferred relay event", relayEvent)
  const finalEvent = finalizeEvent(relayEvent, secret)
  let pool = new SimplePool()
  console.log("preferred event finalized", finalEvent)
  pool.publish(publicRelays, finalEvent).forEach((promise: Promise<any>) => {
    promise.then((value) => console.log("Message from relay", value))
  })
  setTimeout(() => {
    pool.close(publicRelays)
  }, 5000)
}

export async function sendNip17Message(
  recipients: string[],
  message: string,
  pool: SimplePool,
) {
  let privateKey = await getSecretKey()
  if (!privateKey) {
    throw Error("Couldnt find private key in local storage")
  }
  let preferredRelays = await fetchPreferredRelays(recipients, pool)
  let p_tags = recipients.map((recipientId: string) => ["p", recipientId])
  let rumor = createRumor({ content: message, kind: 14, tags: p_tags }, privateKey)
  recipients.forEach(async (recipientId: string) => {
    console.log("recipient is", recipientId)
    let recipientRelays = preferredRelays
      .get(recipientId)
      ?.tags.filter((t: string[]) => t[0] === "relay")
      .map((t) => t[1])
    if (!recipientRelays) sendNIP4Message(message, recipientId)
    recipientRelays = recipientRelays || publicRelays
    console.log("Recipient relays are", recipientRelays)
    let connections = await Promise.all(
      recipientRelays.map(async (relay) => {
        let connection = await Relay.connect(relay)
        console.log("Connection to relay", connection)

        return connection
      }),
    )
    let seal = createSeal(rumor, privateKey, recipientId)
    let wrap = createWrap(seal, recipientId)
    console.warn("Final Wrap Is", wrap)
    connections.forEach(async (connection) => {
      await connection.publish(wrap)
      connection.close()
    })
  })
}