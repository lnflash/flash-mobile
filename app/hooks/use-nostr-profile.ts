import { useState, useEffect } from "react"
import * as Keychain from "react-native-keychain"
import {
  nip19,
  generateSecretKey,
  getPublicKey,
  SimplePool,
  nip04,
  UnsignedEvent,
  finalizeEvent,
} from "nostr-tools"

const useNostrProfile = () => {
  const KEYCHAIN_NOSTRCREDS_KEY = "nostr_creds_key"
  const [nostrSecretKey, setNostrSecretKey] = useState<string>("")
  const [nostrPublicKey, setNostrPublicKey] = useState<string>("")
  const relays = ["wss://relay.damus.io", "wss://relay.primal.net", "wss://nos.lol"]

  const fetchSecretFromLocalStorage = async () => {
    let credentials = await Keychain.getInternetCredentials(KEYCHAIN_NOSTRCREDS_KEY)
    if (credentials) {
      setNostrSecretKey(credentials.password)
      return credentials.password
    }
    return false
  }

  useEffect(() => {
    const initializeNostrProfile = async () => {
      try {
        console.log("Looking for nostr creds in keychain")
        const credentials = await fetchSecretFromLocalStorage()
        if (credentials) return
        const nostrSecret = nip19.nsecEncode(generateSecretKey())
        await Keychain.setInternetCredentials(
          KEYCHAIN_NOSTRCREDS_KEY,
          KEYCHAIN_NOSTRCREDS_KEY,
          nostrSecret,
        )
        setNostrSecretKey(nostrSecret)
        await getPubkey()
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

  const getPubkey = async () => {
    if (nostrPublicKey) return nostrPublicKey
    let privateKey = nostrSecretKey
    if (!privateKey) {
      let localKey = await fetchSecretFromLocalStorage()
      if (!localKey) {
        throw Error("No Nostr key present in the app")
      } else {
        privateKey = localKey
        setNostrSecretKey(privateKey)
      }
    }
    const pubKey = getPublicKey(nip19.decode(privateKey).data as Uint8Array)
    setNostrPublicKey(pubKey)
    return pubKey
  }

  async function encryptMessage(message: string, receiverPublicKey: string) {
    let privateKey = Buffer.from(
      nip19.decode(nostrSecretKey).data as Uint8Array,
    ).toString("hex")
    let ciphertext = await nip04.encrypt(privateKey, receiverPublicKey, message)
    return ciphertext
  }

  function signEvent(baseEvent: UnsignedEvent, userSecretKey: string) {
    const privateKey = nip19.decode(userSecretKey).data as Uint8Array
    const nostrEvent = finalizeEvent(baseEvent, privateKey)
    return nostrEvent
  }

  const sendMessage = async (recipientId: string, message: string) => {
    const ciphertext = await encryptMessage(message, recipientId)
    const baseKind4Event = {
      kind: 4,
      pubkey: await getPubkey(),
      tags: [["p", recipientId]],
      content: ciphertext,
      created_at: Math.floor(Date.now() / 1000),
    }
    const kind4Event = signEvent(baseKind4Event, nostrSecretKey)
    const pool = new SimplePool()
    await Promise.any(pool.publish(relays, kind4Event))
    pool.close(relays)
  }

  const fetchMessagedEvents = async () => {
    let pubkey = await getPubkey()
    let filter = {
      kinds: [4],
      authors: [pubkey],
    }
    const pool = new SimplePool()
    let messagedEvents = await pool.querySync(relays, filter)
    pool.close(relays)
    return messagedEvents
  }

  const fetchProfiles = async (pubkeys: string[]) => {
    let filter = {
      kinds: [0],
      authors: pubkeys,
    }
    const pool = new SimplePool()
    let profiles = await pool.querySync(relays, filter)
    pool.close(relays)
    return profiles
  }

  const retrieveMessagedUsers = async () => {
    const messagedEvents = await fetchMessagedEvents()
    let messagedUsers = new Set<string>()
    messagedEvents.forEach((event) => {
      messagedUsers.add(event.tags[0][1])
    })
    let profileEvents = await fetchProfiles(Array.from(messagedUsers))
    let profiles = profileEvents
      .filter((kind0) => {
        try {
          JSON.parse(kind0.content)
          return true
        } catch (e) {
          return false
        }
      })
      .map((kind0) => {
        return { ...JSON.parse(kind0.content), pubkey: kind0.pubkey }
      })

    return profiles
  }

  const decryptMessage = async (recipientId: string, encryptedMessage: string) => {
    let privateKey = nostrSecretKey
    if (!privateKey) {
      let localKey = await fetchSecretFromLocalStorage()
      if (localKey) privateKey = localKey
      else throw Error("Keys not present in storage")
    }
    let hexKey = nip19.decode(privateKey).data as Uint8Array
    return await nip04.decrypt(hexKey, recipientId, encryptedMessage)
  }

  const fetchMessagesWith = async (recipientId: string) => {
    let userId = await getPubkey()
    let filterSent = {
      "authors": [userId, recipientId],
      "#p": [recipientId, userId],
      "kinds": [4],
    }
    const pool = new SimplePool()
    let events = await pool.querySync(relays, filterSent)
    pool.close(relays)
    let messages = await Promise.all(
      events.map(async (event) => {
        let text = await decryptMessage(recipientId, event.content)
        return {
          text: text,
          author: { id: event.pubkey },
          id: event.id,
          type: "text",
          created_at: event.created_at,
        }
      }),
    )
    messages.sort((a, b) => a.created_at - b.created_at)
    return messages
  }

  return {
    nostrSecretKey,
    nostrPubKey: nostrPublicKey,
    fetchNostrUser,
    sendMessage,
    retrieveMessagedUsers,
    fetchMessagesWith,
  }
}

export default useNostrProfile
