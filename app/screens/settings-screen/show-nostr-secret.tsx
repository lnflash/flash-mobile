import useNostrProfile from "@app/hooks/use-nostr-profile"
import ReactNativeModal from "react-native-modal"
import { View } from "react-native"
import { Text } from "@rneui/themed"

interface ShowNostrSecretProps {
  isActive: boolean
  onCancel: () => void
}

export const ShowNostrSecret: React.FC<ShowNostrSecretProps> = ({
  isActive,
  onCancel,
}) => {
  const { nostrSecretKey } = useNostrProfile()

  return (
    <ReactNativeModal
      isVisible={isActive}
      onDismiss={onCancel}
      collapsable={true}
      backdropColor="white"
      backdropOpacity={0.9}
      onBackButtonPress={onCancel}
      onBackdropPress={onCancel}
    >
      <View style={{ backgroundColor: "white" }}>
        <Text type="h2">Your nostr address is: {"\n"}</Text>
        <Text>{nostrSecretKey}</Text>
      </View>
    </ReactNativeModal>
  )
}
