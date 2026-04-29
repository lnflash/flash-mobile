import React from "react"
import { Modal, TouchableOpacity, View } from "react-native"
import { Icon, Text, makeStyles, useTheme } from "@rneui/themed"
import { useSafeAreaInsets } from "react-native-safe-area-context"

export type TransferOption = {
  icon: string
  title: string
  description: string
  onPress: () => void
}

type Props = {
  visible: boolean
  title: string
  options: TransferOption[]
  onClose: () => void
}

const TransferOptionModal: React.FC<Props> = ({ visible, title, options, onClose }) => {
  const styles = useStyles()
  const { colors, mode } = useTheme().theme
  const bottom = useSafeAreaInsets().bottom

  return (
    <Modal
      animationType="slide"
      transparent={true}
      visible={visible}
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={[
          styles.backdrop,
          {
            backgroundColor: mode === "dark" ? "rgba(57,57,57,.7)" : "rgba(0,0,0,.5)",
          },
        ]}
        activeOpacity={1}
        onPress={onClose}
      >
        <View
          style={[
            styles.modalContainer,
            { backgroundColor: colors.white, paddingBottom: bottom || 10 },
          ]}
        >
          <View style={styles.modalHeader}>
            <Text type="h01">{title}</Text>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <Icon name={"close"} size={30} color={colors.black} type="ionicon" />
            </TouchableOpacity>
          </View>
          {options.map((option, index) => (
            <TouchableOpacity key={index} style={styles.optionBtn} onPress={option.onPress}>
              <Icon type="ionicon" name={option.icon} size={30} color={colors.black} />
              <View style={styles.optionTextWrapper}>
                <Text type="p1">{option.title}</Text>
                <Text type="p3" color={colors.grey2}>
                  {option.description}
                </Text>
              </View>
              <Icon type="ionicon" name={"chevron-forward"} size={20} />
            </TouchableOpacity>
          ))}
        </View>
      </TouchableOpacity>
    </Modal>
  )
}

export default TransferOptionModal

const useStyles = makeStyles(({ colors }) => ({
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
  },
  modalContainer: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 20,
    paddingHorizontal: 20,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 15,
  },
  closeBtn: {
    padding: 5,
  },
  optionBtn: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 15,
    borderWidth: 1,
    borderColor: colors.border01 || "#dedede",
    marginBottom: 10,
    paddingHorizontal: 15,
    paddingVertical: 15,
  },
  optionTextWrapper: {
    flex: 1,
    rowGap: 3,
    marginHorizontal: 15,
  },
}))
