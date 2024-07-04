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
} from "nostr-tools"

const now = () => Math.round(Date.now() / 1000)
type Rumor = UnsignedEvent & { id: string }

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
  console.log("Alias pubkey created is", recipientPublicKey)
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
