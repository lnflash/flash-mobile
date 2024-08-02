import * as React from "react"
import { Image, Linking, ScrollView, View } from "react-native"
import { useNavigation, NavigationProp } from "@react-navigation/native"
import { makeStyles, useTheme, Text } from "@rneui/themed"
import { useI18nContext } from "@app/i18n/i18n-react"
import Modal from "react-native-modal"

// assets
import StablesatsImage from "../../assets/images/stable-sats.png"

// components
import { GaloyPrimaryButton } from "../atomic/galoy-primary-button"
import { GaloySecondaryButton } from "../atomic/galoy-secondary-button"

// utils
import { RootStackParamList } from "@app/navigation/stack-param-lists"

const useStyles = makeStyles(({ colors }) => ({
  stableSatsImage: {
    width: "100%",
    height: 150,
    marginBottom: 16,
  },
  scrollViewStyle: {
    paddingHorizontal: 12,
  },
  modalCard: {
    backgroundColor: colors.white,
    borderRadius: 16,
    paddingVertical: 18,
  },
  cardTitle: {
    textAlign: "center",
    marginBottom: 16,
  },
  cardDescription: {
    marginBottom: 16,
  },
  termsAndConditionsText: {
    textDecorationLine: "underline",
  },
  cardActionsContainer: {
    flexDirection: "column",
  },
  marginBottom: {
    marginBottom: 10,
  },
}))

const DOCS_LINK = "https://docs.getflash.io"
const FLASH_TERMS_LINK = "https://getflash.io/terms.html"

type Props = {
  isVisible: boolean
  setIsVisible: (isVisible: boolean) => void
}

export const AdvancedModeModal: React.FC<Props> = ({ isVisible, setIsVisible }) => {
  const { LL } = useI18nContext()
  const { colors } = useTheme().theme
  const styles = useStyles()

  const navigation = useNavigation<NavigationProp<RootStackParamList>>()

  const acknowledgeModal = () => {
    setIsVisible(false)
  }

  const goToBackupBTCWallet = () => {
    acknowledgeModal()
    navigation.navigate("BackupStart")
  }

  return (
    <Modal
      isVisible={isVisible}
      backdropOpacity={0.3}
      backdropColor={colors.grey3}
      onBackdropPress={acknowledgeModal}
    >
      <View style={styles.modalCard}>
        <ScrollView style={styles.scrollViewStyle}>
          <Image
            source={StablesatsImage}
            style={styles.stableSatsImage}
            resizeMode="contain"
          />
          <Text style={styles.cardTitle} type={"h2"}>
            {LL.AdvancedModeModal.header()}
          </Text>

          <Text style={styles.cardDescription} type="p2">
            {LL.AdvancedModeModal.body()}{" "}
            <Text
              style={styles.termsAndConditionsText}
              onPress={() => Linking.openURL(FLASH_TERMS_LINK)}
            >
              {LL.AdvancedModeModal.termsAndConditions()}
            </Text>
          </Text>

          <View style={styles.cardActionsContainer}>
            <View style={styles.marginBottom}>
              <GaloyPrimaryButton
                title={LL.common.revealSeed()}
                onPress={goToBackupBTCWallet}
              />
            </View>

            <View style={styles.marginBottom}>
              <GaloyPrimaryButton
                title={LL.common.backHome()}
                onPress={acknowledgeModal}
              />
            </View>

            <GaloySecondaryButton
              title={LL.AdvancedModeModal.learnMore()}
              onPress={() => Linking.openURL(DOCS_LINK)}
            />
          </View>
        </ScrollView>
      </View>
    </Modal>
  )
}
