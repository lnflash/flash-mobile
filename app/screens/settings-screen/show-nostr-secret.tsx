import ReactNativeModal from "react-native-modal"
import Clipboard from "@react-native-clipboard/clipboard"
import { View, ViewStyle, Alert } from "react-native"
import { Text, useTheme } from "@rneui/themed"
import { useEffect, useState } from "react"
import { getPublicKey, nip19 } from "nostr-tools"
import Ionicons from "react-native-vector-icons/Ionicons"
import { getSecretKey } from "@app/utils/nostr"
import useNostrProfile from "@app/hooks/use-nostr-profile"
import { useNavigation } from "@react-navigation/native"

interface ShowNostrSecretProps {
  isActive: boolean
  onCancel: () => void
}

export const ShowNostrSecret: React.FC<ShowNostrSecretProps> = ({
  isActive,
  onCancel,
}) => {
  const [secretKey, setSecretKey] = useState<Uint8Array | null>(null)

  useEffect(() => {
    const initialize = async () => {
      if (!secretKey) {
        let secret = await getSecretKey()
        setSecretKey(secret)
        console.log("New secret Key", secret)
      }
    }
    initialize()
  }, [secretKey])

  const { saveNewNostrKey, deleteNostrKeys } = useNostrProfile()
  let nostrPubKey = ""
  if (secretKey) {
    nostrPubKey = nip19.npubEncode(getPublicKey(secretKey as Uint8Array))
  }

  const {
    theme: { colors },
  } = useTheme()
  const [copiedNsec, setCopiedNsec] = useState(false)
  const [copiedNpub, setCopiedNpub] = useState(false)
  const [hideSecret, setHideSecret] = useState(true)

  const styles = {
    modalStyle: {},
    modalBody: {
      backgroundColor: colors.white,
      justifyContent: "flex-start",
      flexDirection: "column",
      alignItems: "flex-start",
      padding: 20,
      borderRadius: 20,
    },
    idContainer: {
      backgroundColor: colors.grey5,
      borderRadius: 5,
      padding: 10,
      margin: 10,
      width: "100%",
    },
  }

  const copyToClipboard = (copyText: string, handler: (copied: boolean) => void) => {
    Clipboard.setString(copyText)
    handler(true)
    setTimeout(() => {
      handler(false)
    }, 1000)
  }

  const navigation = useNavigation()

  const handleEditProfile = () => {
    onCancel()
    navigation.navigate("EditNostrProfile")
  }

  const handleDeleteKeys = () => {
    Alert.alert(
      "Warning",
      "If you have not backed up these keys, you will lose access to this Nostr account forever. Are you sure you want to delete them?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            deleteNostrKeys()
            setSecretKey(null)
          },
        },
      ],
    )
  }

  return (
    <View>
      <ReactNativeModal
        isVisible={isActive}
        backdropColor={colors.grey5}
        backdropOpacity={0.7}
        onBackButtonPress={onCancel}
        onBackdropPress={onCancel}
        style={styles.modalStyle}
      >
        {!!secretKey ? (
          <View style={styles.modalBody as ViewStyle}>
            <Text type="h2">Your nostr address is</Text>
            <View
              style={styles.idContainer as ViewStyle}
              onTouchStart={() => copyToClipboard(nostrPubKey, setCopiedNpub)}
            >
              <Text onPress={() => copyToClipboard(nostrPubKey, setCopiedNpub)}>
                {nostrPubKey} {"\n"}
              </Text>
              <Ionicons
                name={copiedNpub ? "checkmark" : "copy-outline"}
                size={24}
                onPress={() => copyToClipboard(nostrPubKey, setCopiedNpub)}
              />
            </View>

            <Text type="h2">Your nostr secret is</Text>
            <View style={styles.idContainer as ViewStyle}>
              <Text
                onPress={() =>
                  copyToClipboard(nip19.nsecEncode(secretKey), setCopiedNsec)
                }
              >
                {hideSecret ? "***************" : nip19.nsecEncode(secretKey)} {"\n"}
              </Text>
              <View style={{ flexDirection: "row" }}>
                <Ionicons
                  name={hideSecret ? "eye" : "eye-off"}
                  size={24}
                  onPress={() => setHideSecret(!hideSecret)}
                  style={{ marginRight: 10 }}
                />
                <Ionicons
                  name={copiedNsec ? "checkmark" : "copy-outline"}
                  size={24}
                  onPress={() =>
                    copyToClipboard(nip19.nsecEncode(secretKey), setCopiedNsec)
                  }
                />
              </View>
            </View>

            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                width: "100%",
                margin: 10,
              }}
            >
              <Ionicons name="trash" size={20} color="red" onPress={handleDeleteKeys} />
              <Ionicons name="pencil" size={20} onPress={handleEditProfile} />
            </View>
          </View>
        ) : (
          <View style={styles.modalBody as ViewStyle}>
            <Text style={{ margin: 20 }}> No Nostr Keys Found </Text>
            <Ionicons
              name="key"
              size={30}
              onPress={async () => {
                let newSecret = await saveNewNostrKey()
                setSecretKey(newSecret)
              }}
            />
          </View>
        )}
      </ReactNativeModal>
    </View>
  )
}
