import { useState, useEffect } from "react"
import * as Keychain from "react-native-keychain"
import {
  nip19,
  generateSecretKey,
  getPublicKey,
  SimplePool,
  nip04,
  getEventHash,
  UnsignedEvent,
  finalizeEvent,
} from "nostr-tools"

// import { webcrypto } from "node:crypto"
// // @ts-ignore
// if (!globalThis.crypto) globalThis.crypto = webcrypto

const useNostrProfile = () => {
  const KEYCHAIN_NOSTRCREDS_KEY = "nostr_creds_key"
  const [nostrSecretKey, setNostrSecretKey] = useState<string>("")
  const relays = ["wss://relay.damus.io", "wss://relay.primal.net", "wss://purplepag.es"]

  useEffect(() => {
    const initializeNostrProfile = async () => {
      try {
        console.log("Looking for nostr creds in keychain")
        const credentials = await Keychain.getInternetCredentials(KEYCHAIN_NOSTRCREDS_KEY)
        if (credentials) {
          setNostrSecretKey(credentials.password)
          return
        }
        const nostrSecret = nip19.nsecEncode(generateSecretKey())
        await Keychain.setInternetCredentials(
          KEYCHAIN_NOSTRCREDS_KEY,
          KEYCHAIN_NOSTRCREDS_KEY,
          nostrSecret,
        )
        setNostrSecretKey(nostrSecret)
        return nostrSecret
      } catch (error) {
        console.error("Error in generating nostr secret: ", error)
        throw error
      }
    }

    initializeNostrProfile()
  }, [])

  const fetchNostrUser = async (npub: `npub1${string}`) => {
    const pool = new SimplePool()
    const nostrProfile = await pool.get(relays, {
      kinds: [0],
      authors: [nip19.decode(npub).data],
    })
    pool.close(relays)
    if (!nostrProfile?.content) {
      return null
    }
    try {
      return {
        ...JSON.parse(nostrProfile.content),
        pubkey: nostrProfile.pubkey,
      }
    } catch (error) {
      console.error("Error parsing nostr profile: ", error)
      throw error
    }
  }

  const getPubkey = (nostrSecretKey: string) => {
    if (!nostrSecretKey) {
      return ""
    }
    return getPublicKey(nip19.decode(nostrSecretKey).data as Uint8Array)
  }

  async function encryptMessage(message: string, receiverPublicKey: string) {
    let privateKey = Buffer.from(
      nip19.decode(nostrSecretKey).data as Uint8Array,
    ).toString("hex")
    console.log("Encrypting message", message, receiverPublicKey, privateKey)
    let ciphertext = await nip04.encrypt(privateKey, receiverPublicKey, message)
    return ciphertext
  }

  function signEvent(baseEvent: UnsignedEvent, userSecretKey: string) {
    const privateKey = nip19.decode(userSecretKey).data as Uint8Array
    const nostrEvent = finalizeEvent(baseEvent, privateKey)
    return nostrEvent
  }

  const sendMessage = async (recipientId: string, message: string) => {
    console.log("Getting ready to send message:", message, recipientId, nostrSecretKey)
    const ciphertext = await encryptMessage(message, recipientId)
    const baseKind4Event = {
      kind: 4,
      pubkey: getPubkey(nostrSecretKey),
      tags: [["p", recipientId]],
      content: ciphertext,
      created_at: Math.floor(Date.now() / 1000),
    }
    console.log("Unsigned event is ", baseKind4Event)
    const kind4Event = signEvent(baseKind4Event, nostrSecretKey)
    const pool = new SimplePool()
    await Promise.any(pool.publish(relays, kind4Event))
    pool.close(relays)
    console.log("Message issss pubbllliiiiiished")
  }

  return {
    nostrSecretKey,
    nostrPubKey: getPubkey(nostrSecretKey).toString(),
    fetchNostrUser,
    sendMessage,
  }
}

export default useNostrProfile
