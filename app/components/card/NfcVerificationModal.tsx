import React from "react"
import { Dimensions, View } from "react-native"
import Modal from "react-native-modal"
import * as Animatable from "react-native-animatable"
import { makeStyles, Text, useTheme } from "@rneui/themed"

// components
import { PrimaryBtn } from "../buttons"

// assets
import NfcScan from "@app/assets/icons/nfc-scan.svg"

const width = Dimensions.get("screen").width

type Props = {
  isVisible: boolean
  onCancel: () => void
  title?: string
  description?: string
}

/**
 * Modal that prompts user to scan their NFC card for verification
 * Used before making changes to card settings
 */
const NfcVerificationModal: React.FC<Props> = ({
  isVisible,
  onCancel,
  title = "Verify Card",
  description = "Please tap your card to verify ownership",
}) => {
  const styles = useStyles()
  const { colors } = useTheme().theme

  return (
    <Modal
      isVisible={isVisible}
      backdropOpacity={0.8}
      backdropColor={colors.white}
      onBackdropPress={onCancel}
      style={styles.modal}
    >
      <View style={styles.container}>
        <View style={styles.content}>
          <Text type="h02" bold style={styles.title}>
            {title}
          </Text>
          <Text type="bm" style={styles.description}>
            {description}
          </Text>
          <Animatable.View
            animation="pulse"
            easing="ease-out"
            iterationCount="infinite"
          >
            <NfcScan
              width={width / 2}
              height={width / 2}
              style={styles.icon}
            />
          </Animatable.View>
        </View>
        <PrimaryBtn type="outline" label="Cancel" onPress={onCancel} />
      </View>
    </Modal>
  )
}

export default NfcVerificationModal

const useStyles = makeStyles(({ colors }) => ({
  modal: {
    justifyContent: "flex-end",
    margin: 0,
  },
  container: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: colors.grey5,
    padding: 20,
    paddingBottom: 40,
  },
  content: {
    alignItems: "center",
  },
  title: {
    marginBottom: 8,
    color: colors.black,
  },
  description: {
    marginBottom: 16,
    textAlign: "center",
    color: colors.grey0,
  },
  icon: {
    marginVertical: 20,
  },
}))
