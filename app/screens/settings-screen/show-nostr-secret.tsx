import useNostrProfile from "@app/hooks/use-nostr-profile"
import ReactNativeModal from "react-native-modal"
import Clipboard from "@react-native-clipboard/clipboard"
import { View } from "react-native"
import { Text } from "@rneui/themed"
import { useState } from "react"

interface ShowNostrSecretProps {
  isActive: boolean
  onCancel: () => void
}

export const ShowNostrSecret: React.FC<ShowNostrSecretProps> = ({
  isActive,
  onCancel,
}) => {
  const { nostrSecretKey } = useNostrProfile()
  const [copied, setCopied] = useState(false)

  const copyToClipboard = () => {
    Clipboard.setString(nostrSecretKey)
    setCopied(true)
  }

  return (
    <ReactNativeModal
      isVisible={isActive}
      backdropColor="white"
      backdropOpacity={0.9}
      onBackButtonPress={onCancel}
      onBackdropPress={onCancel}
    >
      <View style={{ backgroundColor: "white" }}>
        <Text type="h2">Your nostr address is: {"\n"}</Text>
        <Text>
          {nostrSecretKey} {"\n"}
        </Text>
        <Text onPress={copyToClipboard}>{copied ? "Copied!" : "Click to copy"}</Text>
      </View>
    </ReactNativeModal>
  )
}
