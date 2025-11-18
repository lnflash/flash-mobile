import React, { useRef, useState, useCallback } from "react"
import { Modal, View, Text, TouchableOpacity } from "react-native"
import { makeStyles } from "@rneui/themed"
import { useNavigation } from "@react-navigation/native"
import { RootStackParamList } from "@app/navigation/stack-param-lists"
import { StackNavigationProp } from "@react-navigation/stack"
import { useI18nContext } from "@app/i18n/i18n-react"

export const useRequireContactList = () => {
  const [visible, setVisible] = useState(false)
  const resolver = useRef<(v: boolean) => void>()
  const styles = useStyles()
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>()
  const { LL } = useI18nContext()

  const promptForContactList = useCallback((): Promise<boolean> => {
    setVisible(true)
    return new Promise((resolve) => {
      resolver.current = resolve
    })
  }, [])

  const handleChoice = (goToSettings: boolean) => {
    setVisible(false)
    // We resolve false regardless because the original action (adding a contact)
    // cannot proceed until the list is created in settings.
    resolver.current?.(false)

    if (goToSettings) {
      navigation.navigate("NostrSettingsScreen")
    }
  }

  const ModalComponent: React.FC = () => (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <Text style={styles.title}>{LL.Nostr.Contacts.noCantacts()}</Text>
          <Text style={styles.message}>{LL.Nostr.Contacts.noListDeepLinkMessage()}</Text>
          <View style={styles.buttonsRow}>
            <TouchableOpacity
              style={[styles.button, styles.cancelButton]}
              onPress={() => handleChoice(false)}
            >
              <Text style={styles.cancelText}>{LL.common.cancel()}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, styles.confirmButton]}
              onPress={() => handleChoice(true)}
            >
              <Text style={styles.confirmText}>{LL.Nostr.common.goToSettings()}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  )

  return { promptForContactList, ModalComponent }
}

const useStyles = makeStyles(({ colors }) => ({
  overlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  modal: {
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 20,
    width: "85%",
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 10,
    color: colors.black,
  },
  message: {
    fontSize: 15,
    color: colors.grey3,
    marginBottom: 20,
    lineHeight: 22,
  },
  buttonsRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  button: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  cancelButton: {
    backgroundColor: colors.grey5,
    marginRight: 10,
  },
  confirmButton: {
    backgroundColor: colors.primary,
  },
  cancelText: {
    color: colors.black,
    fontWeight: "600",
  },
  confirmText: {
    color: colors.white,
    fontWeight: "600",
  },
}))
