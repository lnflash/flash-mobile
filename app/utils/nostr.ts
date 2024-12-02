import { useAppConfig } from "@app/hooks"
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

export const fetchGiftWrapsForPublicKey = (
  pubkey: string,
  eventHandler: (event: Event) => void,
  pool: SimplePool,
  flashRelay: string,
) => {
  console.log("FETCHING MESSAGES")
  let closer = pool.subscribeMany(
    [flashRelay, "wss://relay.damus.io"],
    [
      {
        "kinds": [1059],
        "#p": [pubkey],
        "limit": 150,
      },
    ],
    {
      onevent: eventHandler,
      onclose: () => {
        closer.close()
        closer = fetchGiftWrapsForPublicKey(pubkey, eventHandler, pool, flashRelay)
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

export const sendNIP4Message = async (message: string, recipient: string) => {
  let privateKey = await getSecretKey()
  let NIP4Messages = {}
}

export const setPreferredRelay = async (flashRelay: string, secretKey?: Uint8Array) => {
  let pool = new SimplePool()
  console.log("inside setpreferredRelay")
  let secret: Uint8Array | null = null
  if (!secretKey) {
    secret = await getSecretKey()
    if (!secret) {
      Alert.alert("Nostr Private Key Not Assigned")
      return
    }
  } else {
    secret = secretKey
  }
  const pubKey = getPublicKey(secret)
  let relayEvent: UnsignedEvent = {
    pubkey: pubKey,
    tags: [
      ["relay", flashRelay],
      ["relay", "wss://relay.damus.io"],
    ],
    created_at: now(),
    kind: 10050,
    content: "",
  }
  const finalEvent = finalizeEvent(relayEvent, secret)
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
  preferredRelaysMap: Map<string, string[]>,
) {
  let privateKey = await getSecretKey()
  if (!privateKey) {
    throw Error("Couldnt find private key in local storage")
  }
  let p_tags = recipients.map((recipientId: string) => ["p", recipientId])
  let rumor = createRumor({ content: message, kind: 14, tags: p_tags }, privateKey)
  recipients.forEach(async (recipientId: string) => {
    let recipientRelays = preferredRelaysMap.get(recipientId)
    if (!recipientRelays) sendNIP4Message(message, recipientId)
    recipientRelays = recipientRelays || publicRelays
    let seal = createSeal(rumor, privateKey, recipientId)
    let wrap = createWrap(seal, recipientId)
    pool.publish(recipientRelays, wrap).map((promise: Promise<string>) => {
      promise
        .then((res) => console.log("Message from relays", res))
        .catch((err) => {
          console.log("promise errored because", err)
        })
    })
  })
}
