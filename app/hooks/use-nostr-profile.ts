import * as Keychain from "react-native-keychain"
import { nip19, generateSecretKey, getPublicKey } from "nostr-tools"
import { createContactListEvent, setPreferredRelay } from "@app/utils/nostr"
import {
  publishEventToRelays,
  verifyEventOnRelays,
  getPublishingRelays,
} from "@app/utils/nostr/publish-helpers"
import { useHomeAuthedQuery, useUserUpdateNpubMutation } from "@app/graphql/generated"
import { useIsAuthed } from "@app/graphql/is-authed-context"
import { useAppConfig } from "./use-app-config"
import AsyncStorage from "@react-native-async-storage/async-storage"
import { pool } from "@app/utils/nostr/pool"
import {
  generateRoboHashAvatar,
  generateGradientBanner,
} from "@app/utils/nostr/image-generation"
import { uploadToNostrBuild } from "@app/utils/nostr/media-upload"
import { getSigner, createSignerFromKey } from "@app/nostr/signer"

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
  const relays = [
    "wss://relay.flashapp.me",
    "wss://relay.islandbitcoin.com",
    "wss://relay.damus.io",
  ]

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

  const saveNewNostrKey = async (
    progressCallback?: (message: string) => void,
    additionalContent?: any,
  ) => {
    const username = dataAuthed?.me?.username || undefined
    let lud16
    if (username) lud16 = `${username}@${lnDomain}`
    const secretKey = generateSecretKey()
    const nostrSecret = nip19.nsecEncode(secretKey)
    const newNpub = nip19.npubEncode(getPublicKey(secretKey))

    // Create a temporary signer for use during key generation
    const tempSigner = createSignerFromKey(secretKey)

    console.log("🔑 Creating new Nostr key...")
    console.log("Username:", username || "(no username yet)")
    console.log("NPub:", newNpub)
    progressCallback?.("Creating Nostr profile...")

    await userUpdateNpubMutation({
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
    await setPreferredRelay(tempSigner)
    await createContactListEvent(tempSigner)

    // Generate profile images automatically
    let pictureUrl: string | undefined
    let bannerUrl: string | undefined

    console.log("\n🎨 Generating profile images...")
    progressCallback?.("Generating profile picture...")

    try {
      const pubKey = await tempSigner.getPublicKey()

      // Generate avatar
      console.log("Generating RoboHash avatar...")
      const avatarUri = await generateRoboHashAvatar(pubKey)

      // Generate banner
      progressCallback?.("Generating banner image...")
      console.log("Generating gradient banner...")
      const bannerUri = await generateGradientBanner(pubKey)

      // Upload avatar
      progressCallback?.("Uploading profile picture...")
      console.log("Uploading avatar to nostr.build...")
      pictureUrl = await uploadToNostrBuild(avatarUri, tempSigner, false)
      console.log("Avatar uploaded:", pictureUrl)

      // Upload banner
      progressCallback?.("Uploading banner image...")
      console.log("Uploading banner to nostr.build...")
      bannerUrl = await uploadToNostrBuild(bannerUri, tempSigner, false)
      console.log("Banner uploaded:", bannerUrl)
    } catch (error) {
      console.error(
        "Failed to generate/upload images, continuing with text-only profile:",
        error,
      )
      // Silently continue without images
    }

    // Always publish a profile, even if minimal
    console.log("\n📝 Publishing initial profile...")
    progressCallback?.("Publishing profile to relays...")

    try {
      const baseProfileContent = username
        ? {
            name: username,
            username: username,
            flash_username: username,
            lud16: lud16,
            nip05: `${username}@${lnDomain}`,
            ...(pictureUrl && { picture: pictureUrl }),
            ...(bannerUrl && { banner: bannerUrl }),
          }
        : {
            name: "Flash User",
            about: "Flash wallet user",
            ...(pictureUrl && { picture: pictureUrl }),
            ...(bannerUrl && { banner: bannerUrl }),
          }

      // Merge with any additional content passed in (e.g., from username screen)
      const profileContent = {
        ...baseProfileContent,
        ...additionalContent,
        // Ensure images are not overwritten if they were generated
        ...(pictureUrl && { picture: pictureUrl }),
        ...(bannerUrl && { banner: bannerUrl }),
      }

      console.log(
        "Final profile content with images:",
        JSON.stringify(profileContent, null, 2),
      )

      // Create and publish the profile event
      const kind0Event = {
        kind: 0,
        content: JSON.stringify(profileContent),
        tags: [],
        created_at: Math.floor(Date.now() / 1000),
      }

      const signedKind0Event = await tempSigner.signEvent(kind0Event)
      console.log("Profile event signed with ID:", signedKind0Event.id)

      // Get appropriate relays and publish
      const publicRelays = getPublishingRelays("profile")
      const publishResult = await publishEventToRelays(
        pool,
        signedKind0Event,
        publicRelays,
        "Initial Profile (kind-0)",
      )

      if (publishResult.successCount === 0) {
        console.error("❌ CRITICAL: Failed to publish initial profile to ANY relay")
      } else {
        console.log(
          `✅ Initial profile successfully published to ${publishResult.successCount} relays`,
        )
      }

      progressCallback?.("Profile created successfully!")

      // Verify after a short delay
      setTimeout(async () => {
        const verification = await verifyEventOnRelays(
          pool,
          signedKind0Event.id,
          [
            "wss://relay.damus.io",
            "wss://relay.primal.net",
            "wss://nos.lol",
            "wss://relay.islandbitcoin.com",
          ],
          0,
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

  const generateProfileImages = async (
    existingProfileContent?: any,
    progressCallback?: (message: string) => void,
  ): Promise<{ picture?: string; banner?: string } | null> => {
    try {
      progressCallback?.("Generating profile picture...")

      const signer = await getSigner()
      const pubKey = await signer.getPublicKey()

      // Generate images
      console.log("Generating RoboHash avatar...")
      const avatarUri = await generateRoboHashAvatar(pubKey)

      progressCallback?.("Generating banner image...")
      console.log("Generating gradient banner...")
      const bannerUri = await generateGradientBanner(pubKey)

      // Upload to nostr.build
      progressCallback?.("Uploading profile picture...")
      console.log("Uploading avatar to nostr.build...")
      const pictureUrl = await uploadToNostrBuild(avatarUri, signer, false)

      progressCallback?.("Uploading banner image...")
      console.log("Uploading banner to nostr.build...")
      const bannerUrl = await uploadToNostrBuild(bannerUri, signer, false)

      // Update profile with new images
      progressCallback?.("Updating profile...")
      const updatedProfile = {
        ...existingProfileContent,
        picture: pictureUrl,
        banner: bannerUrl,
      }

      await updateNostrProfile({ content: updatedProfile })

      progressCallback?.("Images generated successfully!")
      return { picture: pictureUrl, banner: bannerUrl }
    } catch (error) {
      console.error("Error generating profile images:", error)
      throw error
    }
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
    const retryPromises = failedRelays.map(async (relay) => {
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
      "wss://relay.damus.io",
    ]

    const verificationPromises = criticalRelays.map(async (relay) => {
      try {
        const profile = await pool.get([relay], {
          kinds: [0],
          authors: [pubkey],
        })
        return { relay, found: !!profile }
      } catch (error) {
        return { relay, found: false }
      }
    })

    const results = await Promise.all(verificationPromises)
    const foundCount = results.filter((r) => r.found).length

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
      picture?: string
      banner?: string
      about?: string
      website?: string
    }
  }) => {
    console.log("\n🚀 Starting Nostr profile update...")
    console.log("Profile content to publish:", JSON.stringify(content, null, 2))

    // Get appropriate relays for profile publishing
    const publicRelays = getPublishingRelays("profile")
    console.log(`📡 Will publish to ${publicRelays.length} relays`)

    let signer
    try {
      signer = await getSigner()
    } catch {
      if (dataAuthed && dataAuthed.me && !dataAuthed.me.npub) {
        console.log("No signer found, creating new profile with provided content...")
        await saveNewNostrKey(undefined, content)
        console.log("Profile created with images and content, returning early")
        // Return early - saveNewNostrKey already published the profile with images
        return { successCount: 1, totalRelays: 1, successfulRelays: [] }
      } else {
        throw Error("Could not verify npub")
      }
    }
    const pubKey = await signer.getPublicKey()
    console.log(`🔑 Publishing with pubkey: ${pubKey}`)

    const kind0Event = {
      kind: 0,
      content: JSON.stringify(content),
      tags: [],
      created_at: Math.floor(Date.now() / 1000),
    }

    const signedKind0Event = await signer.signEvent(kind0Event)
    console.log(`✍️ Event signed with id: ${signedKind0Event.id}`)

    // Use the new helper function for publishing
    const publishResult = await publishEventToRelays(
      pool,
      signedKind0Event,
      publicRelays,
      "Profile (kind-0)",
    )

    const successfulRelays = publishResult.successfulRelays
    const failedRelays = publishResult.failedRelays
    const successCount = publishResult.successCount

    // Ensure at least one core relay succeeded
    const coreRelays = ["wss://relay.flashapp.me", "wss://relay.islandbitcoin.com"]
    const coreSuccess = successfulRelays.some((relay) => coreRelays.includes(relay))
    console.log(
      `\n🎯 Core relay status: ${
        coreSuccess
          ? "✅ At least one core relay succeeded"
          : "⚠️ No core relays succeeded"
      }`,
    )

    if (!coreSuccess && failedRelays.length > 0) {
      // Retry core relays if none succeeded
      const coreRelaysToRetry = coreRelays.filter((r) => failedRelays.includes(r))
      console.log(`🔄 Retrying ${coreRelaysToRetry.length} core relays...`)
      const retryResults = await retryFailedRelays(signedKind0Event, coreRelaysToRetry)
      if (retryResults.successCount > 0) {
        successfulRelays.push(...retryResults.successfulRelays)
        console.log(
          `✅ Core relay retry successful! Added ${retryResults.successCount} relays`,
        )
      } else {
        console.log("⚠️ Core relay retry failed")
      }
    }

    if (successfulRelays.length === 0) {
      console.error("❌ CRITICAL: Failed to publish profile to ANY relays!")
      throw new Error("Failed to publish profile to any relays")
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
    generateProfileImages,
  }
}

export default useNostrProfile
