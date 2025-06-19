import React from "react"
import { View, Image, TouchableOpacity } from "react-native"
import { Text, useTheme } from "@rneui/themed"
import { toastShow } from "@app/utils/toast"
import { useStyles } from "./styles"
import { useHomeAuthedQuery } from "@app/graphql/generated"
import { useIsAuthed } from "@app/graphql/is-authed-context"
import { useAppConfig } from "@app/hooks"
import { useI18nContext } from "@app/i18n/i18n-react"

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

  const { LL } = useI18nContext()

  const profileText = dataAuthed?.me?.username
    ? `${dataAuthed.me.username}@${lnDomain}`
    : LL.Nostr.findingYou()

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
      </View>
      <TouchableOpacity
        onPress={() => {
          if (dataAuthed?.me?.username) {
            copyToClipboard(profileText, (copied) => {
              toastShow({
                message: LL.Nostr.common.copied(),
                type: "success",
              })
            })
          }
        }}
        activeOpacity={0.7}
        style={styles.profileInfo}
      >
        <Text>{profileText}</Text>
      </TouchableOpacity>
    </View>
  )
}
