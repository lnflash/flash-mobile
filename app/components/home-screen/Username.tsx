import React from "react"
import { TouchableOpacity } from "react-native"
import { makeStyles, Text, useTheme } from "@rneui/themed"
import { StackNavigationProp } from "@react-navigation/stack"
import { RootStackParamList } from "@app/navigation/stack-param-lists"
import Clipboard from "@react-native-clipboard/clipboard"

// hooks
import { useHideBalanceQuery, useHomeAuthedQuery } from "@app/graphql/generated"
import { useIsAuthed } from "@app/graphql/is-authed-context"
import { useAppConfig } from "@app/hooks"
import { useI18nContext } from "@app/i18n/i18n-react"
import { useNavigation } from "@react-navigation/native"

// utils
import { toastShow } from "@app/utils/toast"

const Username = () => {
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>()
  const isAuthed = useIsAuthed()
  const styles = useStyle()
  const { colors } = useTheme().theme
  const { appConfig } = useAppConfig()
  const { LL } = useI18nContext()

  const { data: { hideBalance = false } = {} } = useHideBalanceQuery()
  const { data, loading } = useHomeAuthedQuery({
    skip: !isAuthed,
  })

  const isHyperlink = !isAuthed || !data?.me?.username
  const hostName = appConfig.galoyInstance.lnAddressHostname
  const lnAddress = `${data?.me?.username}@${hostName}`

  const label = isAuthed
    ? data?.me?.username
      ? `Hello, ${hideBalance ? "*****" : data.me.username}`
      : "Set username"
    : "Login"

  const handleOnPress = () => {
    if (isAuthed) {
      if (data?.me?.username) {
        Clipboard.setString(lnAddress)
        toastShow({
          type: "success",
          position: "top",
          message: (translations) =>
            translations.GaloyAddressScreen.copiedLightningAddressToClipboard(),
          currentTranslation: LL,
        })
      } else {
        navigation.navigate("UsernameSet", { insideApp: true })
      }
    } else {
      navigation.navigate("getStarted")
    }
  }

  if (!loading) {
    return (
      <TouchableOpacity style={styles.lnAddressWrapper} onPress={handleOnPress}>
        <Text type="p2" style={isHyperlink ? styles.hyperlink : {}}>
          {label}
          {!isHyperlink && (
            <Text type="caption" color={colors.grey3}>
              @{hostName}
            </Text>
          )}
        </Text>
      </TouchableOpacity>
    )
  }

  return null
}

export default Username

const useStyle = makeStyles(({ colors }) => ({
  lnAddressWrapper: {
    marginTop: 10,
    marginHorizontal: 25,
  },
  hyperlink: {
    color: colors.accent02,
    textDecorationLine: "underline",
  },
}))
