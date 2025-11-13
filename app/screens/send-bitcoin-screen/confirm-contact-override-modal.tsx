// useConfirmOverwrite.tsx
import React, { useRef, useState, useCallback } from "react"
import { Modal, View, Text, TouchableOpacity } from "react-native"
import { makeStyles } from "@rneui/themed"

export const useConfirmOverwrite = () => {
  const [visible, setVisible] = useState(false)
  const resolver = useRef<(v: boolean) => void>()
  const styles = useStyles()

  const confirmOverwrite = useCallback((): Promise<boolean> => {
    setVisible(true)
    return new Promise((resolve) => {
      resolver.current = resolve
    })
  }, [])

  const handleChoice = (confirmed: boolean) => {
    setVisible(false)
    resolver.current?.(confirmed)
  }

  const modal = (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <Text style={styles.title}>Create New Contact List?</Text>
          <Text style={styles.message}>
            No existing contact list found. Creating one will overwrite any existing
            friends on relays.
          </Text>
          <View style={styles.buttonsRow}>
            <TouchableOpacity
              style={[styles.button, styles.cancelButton]}
              onPress={() => handleChoice(false)}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, styles.confirmButton]}
              onPress={() => handleChoice(true)}
            >
              <Text style={styles.confirmText}>Create</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  )

  const ModalComponent: React.FC = () => modal

  return { confirmOverwrite, ModalComponent }
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
    width: "80%",
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 8,
    color: colors.black,
  },
  message: {
    fontSize: 15,
    color: colors.grey3,
    marginBottom: 20,
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
