import * as Keychain from "react-native-keychain"
import {
  nip19,
  generateSecretKey,
  getPublicKey,
  SimplePool,
  finalizeEvent,
} from "nostr-tools"
import { getSecretKey, setPreferredRelay } from "@app/utils/nostr"
import { useHomeAuthedQuery, useUserUpdateNpubMutation } from "@app/graphql/generated"
import { useIsAuthed } from "@app/graphql/is-authed-context"
import { useAppConfig } from "./use-app-config"

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

  const {
    appConfig: {
      galoyInstance: { relayUrl },
    },
  } = useAppConfig()
  const isAuthed = useIsAuthed()

  const { data: dataAuthed } = useHomeAuthedQuery({
    skip: !isAuthed,
    fetchPolicy: "network-only",
    errorPolicy: "all",
    nextFetchPolicy: "cache-and-network", // this enables offline mode use-case
  })
  const relays = [relayUrl, "wss://relay.damus.io"]

  const [userUpdateNpubMutation] = useUserUpdateNpubMutation()

  const deleteNostrKeys = async () => {
    await Keychain.resetInternetCredentials(KEYCHAIN_NOSTRCREDS_KEY)
  }
  const saveNewNostrKey = async () => {
    let secretKey = generateSecretKey()
    const nostrSecret = nip19.nsecEncode(secretKey)
    let newNpub = nip19.npubEncode(getPublicKey(secretKey))
    const { data } = await userUpdateNpubMutation({
      variables: {
        input: {
          npub: newNpub,
        },
      },
    })
    if (!data?.userUpdateNpub.user?.npub) {
      throw Error("Npub not updated")
    }

    await Keychain.setInternetCredentials(
      KEYCHAIN_NOSTRCREDS_KEY,
      KEYCHAIN_NOSTRCREDS_KEY,
      nostrSecret,
    )
    await setPreferredRelay(relayUrl, secretKey)
    return secretKey
  }

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
    const pool = new SimplePool()
    let publicRelays = [
      ...relays,
      relayUrl,
      "wss://relay.damus.io",
      "wss://relay.primal.net",
      "wss://nos.lol",
    ]
    let secret = await getSecretKey()
    if (!secret) {
      if (dataAuthed && dataAuthed.me && !dataAuthed.me.npub) {
        secret = await saveNewNostrKey()
      } else {
        throw Error("Could not verify npub")
      }
    }
    let pubKey = getPublicKey(secret)
    const kind0Event = {
      kind: 0,
      pubkey: pubKey,
      content: JSON.stringify(content),
      tags: [],
      created_at: Math.floor(Date.now() / 1000),
    }
    const signedKind0Event = finalizeEvent(kind0Event, secret)
    let messages = await Promise.any(pool.publish(publicRelays, signedKind0Event))
    console.log("Profile event published", messages)
    pool.close(publicRelays)
  }

  return {
    fetchNostrUser,
    updateNostrProfile,
    saveNewNostrKey,
    deleteNostrKeys,
  }
}

export default useNostrProfile
