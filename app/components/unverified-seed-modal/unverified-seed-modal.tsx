import * as React from "react"
import { Image, Linking, Modal, View } from "react-native"
import { useI18nContext } from "@app/i18n/i18n-react"
import { makeStyles, Text } from "@rneui/themed"
import { useNavigation, NavigationProp } from "@react-navigation/native"
import { RootStackParamList } from "@app/navigation/stack-param-lists"

// assets
import StablesatsImage from "../../assets/images/unlocked.png"

// components
import { PrimaryBtn } from "../buttons"

const DOCS_LINK = "https://docs.getflash.io"

type Props = {
  isVisible: boolean
  setIsVisible: (isVisible: boolean) => void
}

export const UnVerifiedSeedModal: React.FC<Props> = ({ isVisible, setIsVisible }) => {
  const { LL } = useI18nContext()
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
      animationType="slide"
      transparent={true}
      visible={isVisible}
      onRequestClose={() => setIsVisible(false)}
    >
      <View style={styles.backdrop}>
        <View style={styles.modalCard}>
          <Image
            source={StablesatsImage}
            style={styles.stableSatsImage}
            resizeMode="contain"
          />
          <Text style={styles.cardTitle} type={"h2"} bold>
            {LL.UnVerifiedSeedModal.header()}
          </Text>
          <Text type="p2">{LL.UnVerifiedSeedModal.body()} </Text>
          <Text
            style={styles.textBtn}
            type="p2"
            bold
            onPress={() => Linking.openURL(DOCS_LINK)}
          >
            {LL.UnVerifiedSeedModal.learnMore()}
          </Text>
          <PrimaryBtn
            label={LL.common.revealSeed()}
            onPress={goToBackupBTCWallet}
            btnStyle={styles.marginBottom}
          />
          <PrimaryBtn
            type="outline"
            label={LL.MapScreen.locationPermissionNeutral()}
            onPress={acknowledgeModal}
            btnStyle={styles.marginBottom}
          />
        </View>
      </View>
    </Modal>
  )
}

const useStyles = makeStyles(({ colors, mode }) => ({
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: mode === "dark" ? "rgba(57,57,57,.7)" : "rgba(0,0,0,.5)",
  },
  modalCard: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
  },
  stableSatsImage: {
    height: 150,
    marginBottom: 16,
  },
  cardTitle: {
    textAlign: "center",
    marginBottom: 16,
  },

  textBtn: {
    textDecorationLine: "underline",
    marginBottom: 20,
    marginLeft: 10,
  },
  marginBottom: {
    marginBottom: 10,
  },
}))
