import React from "react"
import { Modal, Image, Linking, ScrollView, View, Dimensions } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { StackNavigationProp } from "@react-navigation/stack"
import { useNavigation } from "@react-navigation/native"
import { useI18nContext } from "@app/i18n/i18n-react"
import { makeStyles, Text } from "@rneui/themed"

// components
import { PrimaryBtn } from "../buttons"

// assets
import AdvanceModeImage from "@app/assets/images/advance-mode.png"

// utils
import { RootStackParamList } from "@app/navigation/stack-param-lists"

const { height } = Dimensions.get("screen")

const DOCS_LINK = "https://docs.getflash.io" // TODO: Need to update link to be the correct documentation for non-custodial wallets.
const FLASH_TERMS_LINK = "https://getflash.io/terms.html" // TODO: Need to update link to be the correct terms and conditions for Flash.

type Props = {
  hasRecoveryPhrase: boolean
  isVisible: boolean
  setIsVisible: (isVisible: boolean) => void
  enableAdvancedMode: () => void
}

export const AdvancedModeModal: React.FC<Props> = ({
  hasRecoveryPhrase,
  isVisible,
  setIsVisible,
  enableAdvancedMode,
}) => {
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>()
  const { bottom } = useSafeAreaInsets()
  const { LL } = useI18nContext()
  const styles = useStyles()

  const acknowledgeModal = () => {
    setIsVisible(false)
    navigation.popToTop()
  }

  const goToBackupBTCWallet = () => {
    acknowledgeModal()
    navigation.navigate("BackupStart")
  }

  const onCreateNewWallet = () => {
    setIsVisible(false)
    enableAdvancedMode()
  }

  const goToImportBTCWallet = () => {
    setIsVisible(false)
    navigation.navigate("ImportWallet", {
      insideApp: true,
      onComplete: () => {
        setTimeout(() => {
          enableAdvancedMode()
        }, 5000)
      },
    })
  }

  return (
    <Modal
      animationType="slide"
      transparent={true}
      visible={isVisible}
      onRequestClose={() => setIsVisible(false)}
    >
      <View style={styles.modalCard}>
        <ScrollView style={styles.scrollViewStyle}>
          <Text style={styles.title}>Be your own Bank</Text>
          <Image
            source={AdvanceModeImage}
            style={styles.advanceModeImage}
            resizeMode="contain"
          />
          <View style={styles.body}>
            <Text style={styles.text} type={"h2"} bold>
              {LL.AdvancedModeModal.header()}
            </Text>
            <Text style={styles.text} type="p2">
              {LL.AdvancedModeModal.body()}
            </Text>
            <Text
              style={styles.textBtn}
              type="p2"
              bold
              onPress={() => Linking.openURL(FLASH_TERMS_LINK)}
            >
              {LL.AdvancedModeModal.termsAndConditions()}
            </Text>
            <Text
              style={styles.textBtn}
              type="p2"
              bold
              onPress={() => Linking.openURL(DOCS_LINK)}
            >
              {LL.AdvancedModeModal.learnMore()}
            </Text>
            <PrimaryBtn
              label={
                hasRecoveryPhrase
                  ? LL.common.revealSeed()
                  : LL.AdvancedModeModal.importWallet()
              }
              onPress={hasRecoveryPhrase ? goToBackupBTCWallet : goToImportBTCWallet}
              btnStyle={{ marginVertical: 10 }}
            />
            <PrimaryBtn
              type="outline"
              label={
                hasRecoveryPhrase
                  ? LL.common.backHome()
                  : LL.AdvancedModeModal.createWallet()
              }
              onPress={hasRecoveryPhrase ? acknowledgeModal : onCreateNewWallet}
              btnStyle={{ marginBottom: bottom + 20 }}
            />
          </View>
        </ScrollView>
      </View>
    </Modal>
  )
}

const useStyles = makeStyles(({ colors, mode }) => ({
  modalCard: {
    paddingTop: height / 7,
    backgroundColor: mode === "dark" ? "rgba(57,57,57,.7)" : "rgba(0,0,0,.5)",
  },
  scrollViewStyle: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  title: {
    fontSize: 28,
    textAlign: "center",
    marginBottom: 20,
    marginTop: 30,
  },
  advanceModeImage: {
    width: "100%",
    marginBottom: 20,
  },
  body: {
    marginHorizontal: 20,
  },
  text: {
    marginBottom: 16,
  },
  textBtn: {
    textDecorationLine: "underline",
    marginBottom: 20,
  },
}))
