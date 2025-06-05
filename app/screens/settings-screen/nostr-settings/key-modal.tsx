import { hexToBytes } from "@noble/curves/abstract/utils"
import { useStyles } from "./styles"
import { getPublicKey, nip19 } from "nostr-tools"
import { useState } from "react"
import ReactNativeModal from "react-native-modal"
import { Alert, TouchableOpacity, View } from "react-native"
import { Button, Text, useTheme } from "@rneui/themed"
import { GaloyPrimaryButton } from "@app/components/atomic/galoy-primary-button"
import Ionicons from "react-native-vector-icons/Ionicons"

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

        <View
          style={[
            styles.keyContainer,
            {
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingHorizontal: 12,
              paddingVertical: 10,
              borderWidth: 1,
              borderColor: colors.grey3,
              borderRadius: 8,
              backgroundColor: colors.white,
            },
          ]}
        >
          <Text
            style={{
              flex: 1,
              fontFamily: "monospace",
              fontSize: 14,
              color: colors.black,
            }}
            numberOfLines={1}
            ellipsizeMode="middle"
          >
            {keyValue}
          </Text>
          {!isPublic && (
            <TouchableOpacity onPress={() => setHideSecret(!hideSecret)}>
              <Ionicons
                name={hideSecret ? "eye" : "eye-off"}
                size={22}
                color={colors.primary}
              />
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.modalButtonsRow}>
          <GaloyPrimaryButton
            title={"Copy"}
            onPress={() => {
              copyToClipboard(isPublic ? nostrPubKey : nip19.nsecEncode(secretKey), () =>
                Alert.alert("Copied", "Key copied to clipboard"),
              )
            }}
            style={{ margin: 10 }}
          />
          <GaloyPrimaryButton title={"Close"} onPress={onClose} style={{ margin: 10 }} />
        </View>
      </View>
    </ReactNativeModal>
  )
}
