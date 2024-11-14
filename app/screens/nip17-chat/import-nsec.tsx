import { useTheme, Text } from "@rneui/themed"
import { View } from "react-native"
import ReactNativeModal from "react-native-modal"

interface ImportNsecModalProps {
  isActive: boolean
  onCancel: () => void
}
const {
  theme: { colors },
} = useTheme()
export const ImportNsecModal: React.FC<ImportNsecModalProps> = ({
  isActive,
  onCancel,
}) => {
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
    },
  }

  return (
    <ReactNativeModal
      isVisible={isActive}
      backdropColor={colors.grey5}
      backdropOpacity={0.7}
      onBackButtonPress={onCancel}
      onBackdropPress={onCancel}
      style={styles.modalStyle}
    >
      <View>
        <Text>
          You are logged into another device, please import your nsec from the other
          device to be able to use the chat feature.
        </Text>
      </View>
    </ReactNativeModal>
  )
}
