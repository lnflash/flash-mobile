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
  Event,
} from "nostr-tools"
import {
  createRumor,
  createSeal,
  createWrap,
  getRumorFromWrap,
  getSecretKey,
  setPreferredRelay,
} from "@app/utils/nostr"
import { useUserUpdateNpubMutation } from "@app/graphql/generated"
import { hexToBytes } from "@noble/curves/abstract/utils"
import { useIsAuthed } from "@app/graphql/is-authed-context"

export interface ChatInfo {
  pubkeys: string[]
  subject?: string
  id: string
}

export type MessageType = {
  id: string
  text: string
  author: { id: string }
  type: string
  createdAt: number
}

const useNostrProfile = () => {
  const KEYCHAIN_NOSTRCREDS_KEY = "nostr_creds_key"
  const [nostrSecretKey, setNostrSecretKey] = useState<string>("")
  const [nostrPublicKey, setNostrPublicKey] = useState<string>("")
  const relays = ["wss://relay.staging.flashapp.me"]

  const [
    userUpdateNpubMutation,
    { data, loading: loadingUpdateNpub, error: updateNpubError },
  ] = useUserUpdateNpubMutation()
  const isAuthed = useIsAuthed()

  const fetchSecretFromLocalStorage = async () => {
    let credentials = await Keychain.getInternetCredentials(KEYCHAIN_NOSTRCREDS_KEY)
    if (credentials) {
      setNostrSecretKey(credentials.password)
      return credentials.password
    }
    return false
  }

  async function encryptMessage(message: string, receiverPublicKey: string) {
    let privateKey = Buffer.from(
      nip19.decode(nostrSecretKey).data as Uint8Array,
    ).toString("hex")
    let ciphertext = await nip04.encrypt(privateKey, receiverPublicKey, message)
    return ciphertext
  }

  useEffect(() => {
    const initializeNostrProfile = async () => {
      try {
        console.log("Looking for nostr creds in keychain")
        const credentials = await fetchSecretFromLocalStorage()
        if (!credentials && isAuthed) {
          let secret = generateSecretKey()
          const nostrSecret = nip19.nsecEncode(secret)
          await Keychain.setInternetCredentials(
            KEYCHAIN_NOSTRCREDS_KEY,
            KEYCHAIN_NOSTRCREDS_KEY,
            nostrSecret,
          )
          setNostrSecretKey(nostrSecret)
          await userUpdateNpubMutation({
            variables: {
              input: {
                npub: nip19.npubEncode(getPublicKey(secret)),
              },
            },
          })
          setPreferredRelay(secret)
          return
        }
        if (credentials && isAuthed) {
          let secret = nip19.decode(credentials).data as Uint8Array
          await userUpdateNpubMutation({
            variables: {
              input: {
                npub: nip19.npubEncode(getPublicKey(secret)),
              },
            },
          })
        }
      } catch (error) {
        console.error("Error in generating nostr secret: ", error)
        throw error
      }
    }

    initializeNostrProfile()
  }, [isAuthed])

  const fetchNostrUser = async (npub: `npub1${string}`) => {
    const pool = new SimplePool()
    const nostrProfile = await pool.get(relays, {
      kinds: [0],
      authors: [nip19.decode(npub).data],
    })
    pool.close(relays)
    if (!nostrProfile?.content) {
      return { pubkey: npub }
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
    const pubKeyHex = getPublicKey(nip19.decode(privateKey).data as Uint8Array)
    let pubKey = nip19.npubEncode(pubKeyHex)
    setNostrPublicKey(pubKey)
    return pubKey
  }

  async function sendNip17Message(recipientId: string, message: string) {
    let recipient
    if (recipientId.startsWith("npub1")) {
      recipient = nip19.decode(recipientId).data as string
    } else {
      recipient = recipientId
    }
    let privateKey = nip19.decode(nostrSecretKey).data as Uint8Array
    let rumor = createRumor(
      { content: message, kind: 14, tags: [["p", `${recipient}`]] },
      privateKey,
    )
    let recipientSeal = createSeal(rumor, privateKey, recipient)
    let senderSeal = createSeal(rumor, privateKey, getPublicKey(privateKey))
    let recipientWrap = createWrap(recipientSeal, recipient)
    let selfWrap = createWrap(senderSeal, getPublicKey(privateKey))

    console.warn("Final Wrap Is", recipientWrap)
    const pool = new SimplePool()
    const messagesEvent1 = await Promise.allSettled(pool.publish(relays, recipientWrap))
    const messagesEvent2 = await Promise.allSettled(pool.publish(relays, selfWrap))
    console.warn("Messages from relays", messagesEvent1, messagesEvent2)
    pool.close(relays)
  }

  const sendMessage = async (recipientId: string, message: string) => {
    let recipient = nip19.decode(recipientId).data as string
    const ciphertext = await encryptMessage(message, recipient)
    const baseKind4Event = {
      kind: 4,
      pubkey: nip19.decode(await getPubkey()).data as string,
      tags: [["p", recipient]],
      content: ciphertext,
      created_at: Math.floor(Date.now() / 1000),
    }
    let privateKey = nip19.decode(nostrSecretKey).data as Uint8Array
    const kind4Event = finalizeEvent(baseKind4Event, privateKey)
    const pool = new SimplePool()
    await Promise.any(pool.publish(relays, kind4Event))
    pool.close(relays)
  }

  const fetchGiftWraps = async (eventHandler: (event: Event) => void) => {
    console.log("Fetching Giftwraps")
    const privateKey = nip19.decode(nostrSecretKey).data as Uint8Array
    const pool = new SimplePool()
    let giftWrapFilters = {
      "kinds": [1059],
      "#p": [getPublicKey(privateKey)],
      "limit": 100,
    }
    console.log("Start Subscription....")
    let subCloser = pool.subscribeMany(relays, [giftWrapFilters], {
      onevent: eventHandler,
    })
    return subCloser
  }

  const retrieveMessagesWith = (npub: string, giftwraps: Event[]) => {
    console.log("retrieving messages with", npub)
    let privateKey = nip19.decode(nostrSecretKey).data as Uint8Array
    let userPubKey = getPublicKey(privateKey)
    let messages: MessageType[] = []
    giftwraps.forEach((wrap: Event) => {
      let rumor
      try {
        rumor = getRumorFromWrap(wrap, privateKey) as UnsignedEvent
      } catch (e) {
        console.log("Found error, moving on", e)
        return
      }
      let pubKeytags = rumor.tags.filter((t) => t[0] === "p")
      if (
        rumor.pubkey === npub &&
        pubKeytags.length === 1 &&
        pubKeytags[0][1] === userPubKey
      ) {
        messages.push({
          text: rumor.content,
          author: { id: nip19.npubEncode(rumor.pubkey) },
          id: wrap.id,
          type: "text",
          createdAt: rumor.created_at,
        })
      }
      if (
        rumor.pubkey === userPubKey &&
        pubKeytags.length === 1 &&
        pubKeytags[0][1] === npub
      ) {
        messages.push({
          text: rumor.content,
          author: { id: nip19.npubEncode(rumor.pubkey) },
          id: wrap.id,
          type: "text",
          createdAt: rumor.created_at,
        })
      }
    })
    messages.sort((a, b) => b.createdAt - a.createdAt)
    return messages
  }

  const retrieveMessagedUsers = (giftwraps: Event[]) => {
    if (!nostrSecretKey) return []
    let privateKey = nip19.decode(nostrSecretKey).data as Uint8Array
    let messagedUsers: Map<string, ChatInfo> = new Map()
    giftwraps.forEach((event) => {
      try {
        let rumor = getRumorFromWrap(event, privateKey)
        let chatPubkeys = rumor.tags
          .filter((t: string[]) => t[0] === "p")
          .map((t: string[]) => t[1])
        let subject = rumor.tags.find((t: string[]) => t[0] === "subject")?.[1]
        messagedUsers.set(chatPubkeys.join(","), {
          pubkeys: chatPubkeys,
          subject: subject,
          id: chatPubkeys.join(","),
        })
      } catch (e) {
        console.log("Error decrypting", e)
      }
    })
    return messagedUsers.values()
  }

  const decryptMessage = async (recipientId: string, encryptedMessage: string) => {
    let recipient = nip19.decode(recipientId).data as string
    let privateKey = nostrSecretKey
    if (!privateKey) {
      let localKey = await fetchSecretFromLocalStorage()
      if (localKey) privateKey = localKey
      else throw Error("Keys not present in storage")
    }
    let hexKey = nip19.decode(privateKey).data as Uint8Array
    return await nip04.decrypt(hexKey, recipient, encryptedMessage)
  }

  const fetchMessagesWith = async (recipientId: string) => {
    let userId = nip19.decode(await getPubkey()).data as string
    let recipient = nip19.decode(recipientId).data as string
    let filterSent = {
      "authors": [userId],
      "#p": [recipient],
      "kinds": [4],
    }
    let filterReceived = {
      "authors": [recipient],
      "#p": [userId],
      "kinds": [4],
    }
    const pool = new SimplePool()
    const sentEvents = await pool.querySync(relays, filterSent)
    const receivedEvents = await pool.querySync(relays, filterReceived)
    const events = [...sentEvents, ...receivedEvents]
    pool.close(relays)
    let messages = await Promise.all(
      events.map(async (event) => {
        let text = ""
        try {
          text = await decryptMessage(recipientId, event.content)
        } catch (e) {
          console.error("Error decrypting message: ", e)
        }
        return {
          text: text,
          author: { id: nip19.npubEncode(event.pubkey) },
          id: event.id,
          type: "text",
          createdAt: event.created_at,
        }
      }),
    )
    messages.sort((a, b) => b.createdAt - a.createdAt)
    return messages
  }

  const updateNostrProfile = async ({
    content,
  }: {
    content: {
      name?: string
      username?: string
      nip05?: string
      flash_username?: string
      lud16?: string
    }
  }) => {
    console.log("inside update Nostr Profile")
    const pool = new SimplePool()
    let publicRelays = [
      ...relays,
      "wss://relay.damus.io",
      "wss://relay.primal.net",
      "wss://nos.lol",
    ]
    let secret = await getSecretKey()
    if (!secret) {
      throw Error("Nostr secret not set")
    }
    let pubKey = getPublicKey(secret)
    const kind0Event = {
      kind: 0,
      pubkey: pubKey,
      content: JSON.stringify(content),
      tags: [],
      created_at: Math.floor(Date.now() / 1000),
    }
    console.log("prepared Event is", kind0Event)
    const signedKind0Event = finalizeEvent(kind0Event, secret)
    console.log("profile event finalized")
    let messages = await Promise.any(pool.publish(publicRelays, signedKind0Event))
    console.log("Profile event published", messages)
    pool.close(publicRelays)
  }

  const fetchNostrPubKey = async () => {
    return nip19.decode(await getPubkey()).data as string
  }

  return {
    nostrSecretKey,
    nostrPubKey: nostrPublicKey,
    fetchNostrUser,
    sendMessage,
    sendNip17Message,
    retrieveMessagedUsers,
    fetchMessagesWith,
    updateNostrProfile,
    retrieveMessagesWith,
    fetchNostrPubKey,
    fetchGiftWraps,
  }
}

export default useNostrProfile
