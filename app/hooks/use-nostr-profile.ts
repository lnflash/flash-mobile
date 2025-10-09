import * as Keychain from "react-native-keychain"
import {
  nip19,
  generateSecretKey,
  getPublicKey,
  SimplePool,
  finalizeEvent,
} from "nostr-tools"
import { getSecretKey, setPreferredRelay } from "@app/utils/nostr"
import { publishEventToRelays, verifyEventOnRelays, getPublishingRelays } from "@app/utils/nostr/publish-helpers"
import { useHomeAuthedQuery, useUserUpdateNpubMutation } from "@app/graphql/generated"
import { useIsAuthed } from "@app/graphql/is-authed-context"
import { useAppConfig } from "./use-app-config"
import AsyncStorage from "@react-native-async-storage/async-storage"
import { pool } from "@app/utils/nostr/pool"

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

  const isAuthed = useIsAuthed()

  const { data: dataAuthed } = useHomeAuthedQuery({
    skip: !isAuthed,
    fetchPolicy: "network-only",
    errorPolicy: "all",
  })
  const {
    appConfig: {
      galoyInstance: { lnAddressHostname: lnDomain },
    },
  } = useAppConfig()
  const relays = ["wss://relay.flashapp.me", "wss://relay.islandbitcoin.com", "wss://relay.damus.io"]

  const [userUpdateNpubMutation] = useUserUpdateNpubMutation()

  const deleteNostrKeys = async () => {
    await Keychain.resetInternetCredentials(KEYCHAIN_NOSTRCREDS_KEY)
  }

  const deleteNostrData = async () => {
    await deleteNostrKeys()
    const keys = await AsyncStorage.getAllKeys()
    const lastSeenKeys = keys.filter((key) => key.startsWith("lastSeen_"))
    AsyncStorage.multiRemove(lastSeenKeys)
    AsyncStorage.removeItem("giftwraps")
  }

  const saveNewNostrKey = async () => {
    const username = dataAuthed?.me?.username || undefined
    let lud16
    if (username) lud16 = `${username}@${lnDomain}`
    let secretKey = generateSecretKey()
    const nostrSecret = nip19.nsecEncode(secretKey)
    let newNpub = nip19.npubEncode(getPublicKey(secretKey))

    console.log("🔑 Creating new Nostr key...")
    console.log("Username:", username || "(no username yet)")
    console.log("NPub:", newNpub)
    const { data } = await userUpdateNpubMutation({
      variables: {
        input: {
          npub: newNpub,
        },
      },
    })

    await Keychain.setInternetCredentials(
      KEYCHAIN_NOSTRCREDS_KEY,
      KEYCHAIN_NOSTRCREDS_KEY,
      nostrSecret,
    )
    await setPreferredRelay(secretKey)

    // Always publish a profile, even if minimal
    console.log("\n📝 Publishing initial profile...")
    try {
      const profileContent = username ? {
        name: username,
        username: username,
        flash_username: username,
        lud16: lud16,
        nip05: `${username}@${lnDomain}`,
      } : {
        name: "Flash User",
        about: "Flash wallet user",
      }

      // Create and publish the profile event
      const pubKey = getPublicKey(secretKey)
      const kind0Event = {
        kind: 0,
        pubkey: pubKey,
        content: JSON.stringify(profileContent),
        tags: [],
        created_at: Math.floor(Date.now() / 1000),
      }

      const signedKind0Event = finalizeEvent(kind0Event, secretKey)
      console.log("Profile event signed with ID:", signedKind0Event.id)

      // Get appropriate relays and publish
      const publicRelays = getPublishingRelays("profile")
      const publishResult = await publishEventToRelays(
        pool,
        signedKind0Event,
        publicRelays,
        "Initial Profile (kind-0)"
      )

      if (publishResult.successCount === 0) {
        console.error("❌ CRITICAL: Failed to publish initial profile to ANY relay")
      } else {
        console.log(`✅ Initial profile successfully published to ${publishResult.successCount} relays`)
      }

      // Verify after a short delay
      setTimeout(async () => {
        const verification = await verifyEventOnRelays(
          pool,
          signedKind0Event.id,
          ["wss://relay.damus.io", "wss://relay.primal.net", "wss://relay.islandbitcoin.com"],
          0
        )
        if (verification.found) {
          console.log("✅ Initial profile verified on major relays")
        } else {
          console.log("⚠️ Initial profile verification failed - may need to republish")
        }
      }, 3000)
    } catch (error) {
      console.error("Failed to publish initial profile:", error)
      // Don't throw - key creation succeeded even if profile publishing failed
    }

    return secretKey
  }

  const fetchNostrUser = async (npub: `npub1${string}`) => {
    const nostrProfile = await pool.get(relays, {
      kinds: [0],
      authors: [nip19.decode(npub).data],
    })
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

  // Retry mechanism for failed relay publishing
  const retryFailedRelays = async (event: any, failedRelays: string[]) => {
    if (failedRelays.length === 0) return { successCount: 0, successfulRelays: [] }


    const successfulRelays: string[] = []
    const retryPromises = failedRelays.map(async relay => {
      try {
        // pool.publish returns an array of promises
        const publishResults = pool.publish([relay], event)
        await Promise.all(publishResults)
        successfulRelays.push(relay)
        return { relay, success: true }
      } catch (error) {
        return { relay, success: false }
      }
    })

    await Promise.allSettled(retryPromises)
    return { successCount: successfulRelays.length, successfulRelays }
  }

  // Verify profile propagation across critical relays
  const verifyProfile = async (pubkey: string) => {
    const criticalRelays = [
      "wss://relay.flashapp.me",
      "wss://relay.islandbitcoin.com",
      "wss://relay.damus.io"
    ]

    const verificationPromises = criticalRelays.map(async relay => {
      try {
        const profile = await pool.get([relay], {
          kinds: [0],
          authors: [pubkey]
        })
        return { relay, found: !!profile }
      } catch (error) {
        return { relay, found: false }
      }
    })

    const results = await Promise.all(verificationPromises)
    const foundCount = results.filter(r => r.found).length


    return foundCount
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
    console.log("\n🚀 Starting Nostr profile update...")
    console.log("Profile content to publish:", JSON.stringify(content, null, 2))

    // Get appropriate relays for profile publishing
    const publicRelays = getPublishingRelays("profile")
    console.log(`📡 Will publish to ${publicRelays.length} relays`)

    let secret = await getSecretKey()
    if (!secret) {
      if (dataAuthed && dataAuthed.me && !dataAuthed.me.npub) {
        secret = await saveNewNostrKey()
      } else {
        throw Error("Could not verify npub")
      }
    }
    let pubKey = getPublicKey(secret)
    console.log(`🔑 Publishing with pubkey: ${pubKey}`)

    const kind0Event = {
      kind: 0,
      pubkey: pubKey,
      content: JSON.stringify(content),
      tags: [],
      created_at: Math.floor(Date.now() / 1000),
    }


    const signedKind0Event = finalizeEvent(kind0Event, secret)
    console.log(`✍️ Event signed with id: ${signedKind0Event.id}`)

    // Use the new helper function for publishing
    const publishResult = await publishEventToRelays(
      pool,
      signedKind0Event,
      publicRelays,
      "Profile (kind-0)"
    )

    const successfulRelays = publishResult.successfulRelays
    const failedRelays = publishResult.failedRelays
    const successCount = publishResult.successCount

    // Ensure at least one core relay succeeded
    const coreRelays = [
      "wss://relay.flashapp.me",
      "wss://relay.islandbitcoin.com"
    ]
    const coreSuccess = successfulRelays.some(relay => coreRelays.includes(relay))
    console.log(`\n🎯 Core relay status: ${coreSuccess ? '✅ At least one core relay succeeded' : '⚠️ No core relays succeeded'}`)


    if (!coreSuccess && failedRelays.length > 0) {
      // Retry core relays if none succeeded
      const coreRelaysToRetry = coreRelays.filter(r => failedRelays.includes(r))
      console.log(`🔄 Retrying ${coreRelaysToRetry.length} core relays...`)
      const retryResults = await retryFailedRelays(signedKind0Event, coreRelaysToRetry)
      if (retryResults.successCount > 0) {
        successfulRelays.push(...retryResults.successfulRelays)
        console.log(`✅ Core relay retry successful! Added ${retryResults.successCount} relays`)
      } else {
        console.log("⚠️ Core relay retry failed")
      }
    }

    if (successfulRelays.length === 0) {
      console.error("❌ CRITICAL: Failed to publish profile to ANY relays!")
      throw new Error("Failed to publish profile to any relays")
    }

    console.log(`\n✨ Profile update completed with ${successCount} successful publishes`)

    // Background retry for remaining failed relays
    if (failedRelays.length > 0) {
      console.log(`⏰ Scheduling background retry for ${failedRelays.length} failed relays in 5 seconds...`)
      setTimeout(() => {
        console.log("🔄 Starting background retry for failed relays...")
        retryFailedRelays(signedKind0Event, failedRelays)
      }, 5000)
    }


    // Verify profile propagation after 3 seconds
    if (successfulRelays.length > 0) {
      setTimeout(async () => {
        console.log("\n🔍 Starting profile propagation verification...")

        // Use the new verification helper
        const verifyRelays = [
          "wss://relay.flashapp.me",
          "wss://relay.islandbitcoin.com",
          "wss://relay.damus.io",
          "wss://relay.primal.net"
        ]

        const verification = await verifyEventOnRelays(
          pool,
          signedKind0Event.id,
          verifyRelays,
          0 // kind-0 for profile
        )

        if (verification.found) {
          console.log(`✅ Profile verified on ${verification.foundOnRelays.length} critical relays`)
          console.log("Profile available on:", verification.foundOnRelays.join(", "))
        } else {
          console.log("⚠️ WARNING: Profile verification failed - not found on any critical relay")
        }
      }, 3000)
    }

    return { successCount, totalRelays: publicRelays.length, successfulRelays }
  }

  return {
    fetchNostrUser,
    updateNostrProfile,
    saveNewNostrKey,
    deleteNostrKeys,
    deleteNostrData,
    verifyProfile,
  }
}

export default useNostrProfile
