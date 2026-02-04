import React, { useState } from "react"
import { Pressable, ActivityIndicator, Alert } from "react-native"
import { Text, useTheme } from "@rneui/themed"
import Ionicons from "react-native-vector-icons/Ionicons"
import { getSecretKey } from "@app/utils/nostr"
import { getPublicKey, finalizeEvent } from "nostr-tools"
import { pool } from "@app/utils/nostr/pool"
import { publishEventToRelays, verifyEventOnRelays, getPublishingRelays } from "@app/utils/nostr/publish-helpers"
import { useI18nContext } from "@app/i18n/i18n-react"

interface ManualRepublishButtonProps {
  username?: string | null
  lnDomain?: string
  onSuccess?: () => void
}

export const ManualRepublishButton: React.FC<ManualRepublishButtonProps> = ({
  username,
  lnDomain = "flashapp.me",
  onSuccess,
}) => {
  const { theme: { colors } } = useTheme()
  const { LL } = useI18nContext()
  const [isPublishing, setIsPublishing] = useState(false)

  const handleRepublishProfile = async () => {
    if (!username) {
      Alert.alert("Error", "Username not found. Please set your username first.")
      return
    }

    setIsPublishing(true)

    try {
      const secretKey = await getSecretKey()
      if (!secretKey) {
        Alert.alert("Error", "No Nostr key found. Please create a profile first.")
        return
      }

      const pubKey = getPublicKey(secretKey)
      const lud16 = `${username}@${lnDomain}`
      const nip05 = `${username}@${lnDomain}`

      console.log("\n🔄 MANUAL PROFILE REPUBLISH")
      console.log("=" .repeat(60))
      console.log("Username:", username)
      console.log("Lightning address:", lud16)
      console.log("NIP-05:", nip05)
      console.log("Pubkey:", pubKey)

      // Create profile content
      const profileContent = {
        name: username,
        username: username,
        flash_username: username,
        lud16: lud16,
        nip05: nip05,
        about: `Flash user - ${username}`,
      }

      // Create kind-0 event
      const kind0Event = {
        kind: 0,
        pubkey: pubKey,
        content: JSON.stringify(profileContent),
        tags: [],
        created_at: Math.floor(Date.now() / 1000),
      }

      const signedEvent = finalizeEvent(kind0Event, secretKey)
      console.log("Event signed with ID:", signedEvent.id)

      // Get relays and publish
      const relays = getPublishingRelays("profile")
      console.log(`Will publish to ${relays.length} relays`)

      const result = await publishEventToRelays(
        pool,
        signedEvent,
        relays,
        "Manual Profile Republish"
      )

      console.log(`\n✅ Published to ${result.successCount}/${relays.length} relays`)

      // Verify after 2 seconds
      setTimeout(async () => {
        const verification = await verifyEventOnRelays(
          pool,
          signedEvent.id,
          ["wss://relay.damus.io", "wss://relay.primal.net", "wss://relay.islandbitcoin.com"],
          0
        )

        if (verification.found) {
          Alert.alert(
            "Success!",
            `Profile republished to ${result.successCount} relays and verified on major relays.\n\nLightning address: ${lud16}`,
            [{ text: "OK", onPress: onSuccess }]
          )
        } else {
          Alert.alert(
            "Partial Success",
            `Profile published to ${result.successCount} relays but verification failed. You may need to try again.`,
            [{ text: "OK" }]
          )
        }
      }, 2000)

    } catch (error) {
      console.error("Failed to republish profile:", error)
      Alert.alert("Error", "Failed to republish profile. Please try again.")
    } finally {
      setIsPublishing(false)
    }
  }

  return (
    <Pressable
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: colors.warning,
        borderRadius: 16,
        marginTop: 10,
        marginHorizontal: 16,
        opacity: isPublishing ? 0.7 : 1,
      }}
      onPress={handleRepublishProfile}
      disabled={isPublishing}
    >
      {isPublishing ? (
        <ActivityIndicator size="small" color={colors.white} style={{ marginRight: 10 }} />
      ) : (
        <Ionicons
          name="refresh-outline"
          size={20}
          color={colors.white}
          style={{ marginRight: 10 }}
        />
      )}
      <Text style={{ color: colors.white, fontWeight: "bold" }}>
        {isPublishing ? "Publishing..." : "🔧 DEBUG: Republish Profile to Relays"}
      </Text>
    </Pressable>
  )
}