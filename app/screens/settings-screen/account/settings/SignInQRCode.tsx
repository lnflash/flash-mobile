import React, { useEffect, useState } from "react"
import { StackNavigationProp } from "@react-navigation/stack"
import { Alert, useWindowDimensions, View } from "react-native"
import { RootStackParamList } from "@app/navigation/stack-param-lists"
import { useTheme, Text, makeStyles } from "@rneui/themed"
import { bytesToHex } from "@noble/curves/abstract/utils"
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
import { useFocusEffect, useNavigation } from "@react-navigation/native"

// utils
import { KEYCHAIN_MNEMONIC_KEY } from "@app/utils/breez-sdk-liquid"
import KeyStoreWrapper from "@app/utils/storage/secureStorage"
import { PinScreenPurpose } from "@app/utils/enum"
import { getSecretKey } from "@app/utils/nostr"

// assets
import Logo from "@app/assets/logo/blink-logo-icon.png"

export const SignInQRCode = () => {
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>()
  const styles = useStyles()
  const { LL } = useI18nContext()
  const { colors } = useTheme().theme
  const { width } = useWindowDimensions()

  const [modalVisible, setModalVisible] = useState(false)
  const [QRCodeValue, setQRCodeValue] = useState<string>()
  const [isPinEnabled, setIsPinEnabled] = useState(false)

  const { data, loading } = useSettingsScreenQuery()

  useEffect(() => {
    createQRCodeString()
  }, [data?.me?.phone])

  useFocusEffect(() => {
    getIsPinEnabled()
  })

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

    const secret = await getSecretKey()
    if (secret) {
      obj.nsec = bytesToHex(secret)
    }

    setQRCodeValue(base64encode(JSON.stringify(obj)))
  }

  const getIsPinEnabled = async () => {
    setIsPinEnabled(await KeyStoreWrapper.getIsPinEnabled())
  }

  const onOpenModal = () => {
    if (isPinEnabled) {
      navigation.navigate("pin", {
        screenPurpose: PinScreenPurpose.CheckPin,
        callback: () => setModalVisible(true),
      })
    } else {
      Alert.alert(
        "Enable PIN Code",
        "Please enable a PIN code as an extra security layer to display the login QR code.",
        [
          {
            text: LL.common.ok(),
            onPress: () =>
              navigation.navigate("pin", {
                screenPurpose: PinScreenPurpose.SetPin,
                callback: () => setModalVisible(true),
              }),
          },
        ],
      )
    }
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
        onPress={onOpenModal}
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
