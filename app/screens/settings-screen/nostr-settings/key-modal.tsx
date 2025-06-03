import { hexToBytes } from "@noble/curves/abstract/utils"
import { useStyles } from "./styles"
import { getPublicKey, nip19 } from "nostr-tools"
import { useState } from "react"
import ReactNativeModal from "react-native-modal"
import { Alert, View } from "react-native"
import { Button, Text, useTheme } from "@rneui/themed"

interface KeyModalProps {
  isOpen: boolean
  secretKeyHex: string
  keysModalType: string
  onClose: () => void
  copyToClipboard: (text: string, onSuccess?: (copied: boolean) => void) => void
}
export const KeyModal: React.FC<KeyModalProps> = ({
  isOpen,
  secretKeyHex,
  keysModalType,
  onClose,
  copyToClipboard,
}) => {
  const styles = useStyles()
  const [hideSecret, setHideSecret] = useState(true)
  const secretKey = hexToBytes(secretKeyHex)
  const nostrPubKey = nip19.npubEncode(getPublicKey(secretKey))
  const isPublic = keysModalType === "public"
  const keyValue = isPublic
    ? nostrPubKey
    : hideSecret
    ? "***************"
    : nip19.nsecEncode(secretKey)

  const {
    theme: { colors },
  } = useTheme()

  return (
    <ReactNativeModal
      isVisible={isOpen}
      backdropColor={colors.grey5}
      backdropOpacity={0.7}
      onBackButtonPress={onClose}
      onBackdropPress={onClose}
    >
      <View style={styles.modalContainer}>
        <Text style={styles.modalTitle}>
          {isPublic ? "Your Public Profile ID" : "Your Private Profile Key"}
        </Text>

        <View style={styles.keyContainer}>
          <Text>{keyValue}</Text>
        </View>

        <View style={styles.modalButtonsRow}>
          {!isPublic && (
            <Button onPress={() => setHideSecret(!hideSecret)}>
              <Text>{hideSecret ? "Show" : "Hide"}</Text>
            </Button>
          )}

          <Button
            onPress={() => {
              copyToClipboard(isPublic ? nostrPubKey : nip19.nsecEncode(secretKey), () =>
                Alert.alert("Copied", "Key copied to clipboard"),
              )
            }}
          >
            <Text style={styles.modalButtonText}>Copy</Text>
          </Button>

          <Button onPress={onClose}>
            <Text style={styles.modalButtonText}>Close</Text>
          </Button>
        </View>
      </View>
    </ReactNativeModal>
  )
}
