import React, { useEffect, useState } from "react"
import { useWindowDimensions, View } from "react-native"
import { useTheme, Text, makeStyles } from "@rneui/themed"
import * as Keychain from "react-native-keychain"
import QRCode from "react-native-qrcode-svg"
import { base64encode } from "byte-base64"
import Modal from "react-native-modal"

// components
import { SettingsButton } from "../../button"
import { GaloyIconButton } from "@app/components/atomic/galoy-icon-button"

// hooks
import { useI18nContext } from "@app/i18n/i18n-react"
import { useSettingsScreenQuery } from "@app/graphql/generated"

// utils
import { KEYCHAIN_MNEMONIC_KEY } from "@app/utils/breez-sdk-liquid"

// assets
import Logo from "@app/assets/logo/blink-logo-icon.png"

export const SignInQRCode = () => {
  const styles = useStyles()
  const { LL } = useI18nContext()
  const { colors } = useTheme().theme
  const { width } = useWindowDimensions()

  const [modalVisible, setModalVisible] = useState(false)
  const [QRCodeValue, setQRCodeValue] = useState<string>()

  const { data, loading } = useSettingsScreenQuery()

  useEffect(() => {
    createQRCodeString()
  }, [data?.me?.phone])

  const createQRCodeString = async () => {
    const obj = {
      phone: data?.me?.phone,
      mnemonicKey: "",
      nsec: "",
    }

    const mnemonicKey = await Keychain.getInternetCredentials(KEYCHAIN_MNEMONIC_KEY)
    if (mnemonicKey) {
      obj.mnemonicKey = mnemonicKey.password
    }

    setQRCodeValue(base64encode(JSON.stringify(obj)))
  }

  const AccountDeletionModal = (
    <Modal
      isVisible={modalVisible}
      onBackdropPress={() => setModalVisible(false)}
      backdropOpacity={0.8}
      backdropColor={colors.white}
      avoidKeyboard={true}
    >
      <View style={styles.view}>
        <View style={styles.actionButtons}>
          <Text type="h1" bold>
            Scan the QR code
          </Text>
          <GaloyIconButton
            name="close"
            onPress={() => setModalVisible(false)}
            size={"medium"}
          />
        </View>
        <QRCode
          size={width / 1.5}
          value={QRCodeValue}
          logoBackgroundColor="white"
          logo={Logo}
          logoSize={60}
          logoBorderRadius={10}
        />
        <View style={{ rowGap: 4 }}>
          <Text type="bm" bold>
            1. Open the Flash app
          </Text>
          <Text type="bm" bold>
            2. Go to Login
          </Text>
          <Text type="bm" bold>
            3. Press Sign In with QR code
          </Text>
          <Text type="bm" bold>
            4. Make sure you sign in to the account from your device
          </Text>
        </View>
      </View>
    </Modal>
  )

  return (
    <>
      <SettingsButton
        loading={loading}
        title={"Show QR for Login"}
        variant="warning"
        onPress={() => setModalVisible(!modalVisible)}
      />
      {AccountDeletionModal}
    </>
  )
}

const useStyles = makeStyles(({ colors }) => ({
  view: {
    marginHorizontal: 20,
    backgroundColor: colors.grey5,
    padding: 20,
    borderRadius: 20,
    display: "flex",
    flexDirection: "column",
    rowGap: 20,
  },
  actionButtons: {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
}))
