import React, { useState } from "react"
import { TouchableOpacity } from "react-native"
import Clipboard from "@react-native-clipboard/clipboard"
import { makeStyles, Text, useTheme } from "@rneui/themed"
import { StackNavigationProp } from "@react-navigation/stack"
import { RootStackParamList } from "@app/navigation/stack-param-lists"

// components
import { SetLightningAddressModal } from "../set-lightning-address-modal"

// hooks
import { useHomeAuthedQuery } from "@app/graphql/generated"
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

  const [modalVisible, setModalVisible] = useState(false)

  const { data, loading } = useHomeAuthedQuery({
    skip: !isAuthed,
  })

  const hostName = appConfig.galoyInstance.lnAddressHostname
  const lnAddress = `${data?.me?.username}@${hostName}`

  const label = isAuthed
    ? data?.me?.username
      ? `Hello, ${data.me.username}`
      : "Set username"
    : "Login"

  const onCopyLnAddress = () => {
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
        setModalVisible(true)
      }
    } else {
      navigation.reset({
        index: 0,
        routes: [{ name: "getStarted" }],
      })
    }
  }

  if (!loading) {
    return (
      <>
        <TouchableOpacity style={styles.lnAddressWrapper} onPress={onCopyLnAddress}>
          <Text type="p2" style={{ marginRight: 10 }}>
            {label}
            {data?.me?.username && (
              <Text type="caption" color={colors.grey3}>
                @{hostName}
              </Text>
            )}
          </Text>
        </TouchableOpacity>
        <SetLightningAddressModal
          isVisible={modalVisible}
          toggleModal={() => setModalVisible(!modalVisible)}
        />
      </>
    )
  }

  return null
}

export default Username

const useStyle = makeStyles(() => ({
  lnAddressWrapper: {
    marginTop: 10,
    marginHorizontal: 25,
  },
}))
