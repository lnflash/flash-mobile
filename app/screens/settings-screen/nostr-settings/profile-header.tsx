import React from "react"
import { View, Image, TouchableOpacity } from "react-native"
import { Text, useTheme } from "@rneui/themed"
import { toastShow } from "@app/utils/toast"
import { useStyles } from "./styles"
import { useHomeAuthedQuery } from "@app/graphql/generated"
import { useIsAuthed } from "@app/graphql/is-authed-context"
import { useAppConfig } from "@app/hooks"

interface ProfileHeaderProps {
  userProfile: { picture?: string } | null
  copyToClipboard: (text: string, onSuccess?: (copied: boolean) => void) => void
}

export const ProfileHeader = ({ userProfile, copyToClipboard }: ProfileHeaderProps) => {
  const styles = useStyles()
  const isAuthed = useIsAuthed()
  const { data: dataAuthed } = useHomeAuthedQuery({
    skip: !isAuthed,
    fetchPolicy: "network-only",
    errorPolicy: "all",
    nextFetchPolicy: "network-only",
  })

  const {
    appConfig: {
      galoyInstance: { lnAddressHostname: lnDomain },
    },
  } = useAppConfig()

  const profileText = dataAuthed?.me?.username
    ? `${dataAuthed.me.username}@${lnDomain}`
    : "Finding You.."
  return (
    <View style={styles.profileHeader}>
      <View style={styles.profileIcon}>
        <Image
          source={{
            uri:
              userProfile?.picture ||
              "https://pfp.nostr.build/520649f789e06c2a3912765c0081584951e91e3b5f3366d2ae08501162a5083b.jpg",
          }}
          style={{
            width: 80,
            height: 80,
            borderRadius: 40,
          }}
        />

        {/* <Ionicons name="person-circle-outline" size={80} color={colors.grey3} /> */}
      </View>
      <TouchableOpacity
        onPress={() => {
          dataAuthed?.me?.username
            ? copyToClipboard(profileText, (copied) => {
                toastShow({
                  message: "Copied",
                  type: "success",
                })
              })
            : null
        }}
        activeOpacity={0.7}
        style={styles.profileInfo}
      >
        <Text>{profileText}</Text>
      </TouchableOpacity>
    </View>
  )
}
