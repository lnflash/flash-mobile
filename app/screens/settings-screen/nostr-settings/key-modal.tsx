import { hexToBytes } from "@noble/curves/abstract/utils"
import { useStyles } from "./styles"
import { getPublicKey, nip19 } from "nostr-tools"
import { useState } from "react"
import ReactNativeModal from "react-native-modal"
import { Alert, TouchableOpacity, View } from "react-native"
import { useTheme, Text } from "@rneui/themed"
import Ionicons from "react-native-vector-icons/Ionicons"
import { PrimaryBtn } from "@app/components/buttons"
import { useI18nContext } from "@app/i18n/i18n-react" // <-- import i18n

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
  const { mode } = useTheme().theme
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

  const { LL } = useI18nContext() // <-- use translations

  const onCopy = () =>
    copyToClipboard(isPublic ? nostrPubKey : nip19.nsecEncode(secretKey), () =>
      Alert.alert(LL.Nostr.common.copied(), LL.Nostr.KeyModal.keyCopiedToClipboard()),
    )

  return (
    <ReactNativeModal
      isVisible={isOpen}
      backdropColor={mode === "dark" ? "rgba(57,57,57,.7)" : "rgba(0,0,0,.5)"}
      backdropOpacity={1}
      onBackButtonPress={onClose}
      onBackdropPress={onClose}
    >
      <View style={styles.modalContainer}>
        <Text style={styles.modalTitle}>
          {isPublic
            ? LL.Nostr.KeyModal.yourPublicProfileId()
            : LL.Nostr.KeyModal.yourPrivateProfileKey()}
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
          <PrimaryBtn
            type="outline"
            label={LL.Nostr.common.copy()}
            onPress={onCopy}
            btnStyle={{ minWidth: 150 }}
          />
          <PrimaryBtn
            label={LL.common.close()}
            onPress={onClose}
            btnStyle={{ minWidth: 150 }}
          />
        </View>
      </View>
    </ReactNativeModal>
  )
}
