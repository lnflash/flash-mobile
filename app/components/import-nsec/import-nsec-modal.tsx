import React, { useState } from "react"
import { useTheme, Text, Input, Button } from "@rneui/themed"
import { View, StyleSheet, Alert, Dimensions } from "react-native"
import ReactNativeModal from "react-native-modal"
import { useUserUpdateNpubMutation } from "@app/graphql/generated"
import { getPublicKey, nip19 } from "nostr-tools"
import { importNsec } from "./utils"
import { NsecInputForm } from "./import-nsec-form"

interface ImportNsecModalProps {
  isActive: boolean
  onCancel: () => void
  onSubmit: () => void
}

export const ImportNsecModal: React.FC<ImportNsecModalProps> = ({
  isActive,
  onCancel,
  onSubmit,
}) => {
  const {
    theme: { colors },
  } = useTheme()

  return (
    <ReactNativeModal
      isVisible={isActive}
      backdropColor={colors.grey5}
      backdropOpacity={0.7}
      onBackButtonPress={onCancel}
      onBackdropPress={onCancel}
      style={styles.modalStyle}
    >
      <View style={styles.modalBody}>
        <Text style={styles.title}>Import Your nsec Key</Text>
        <Text style={styles.description}>
          You are logged into another device. Please import your nsec from the other
          device to continue using the chat feature.
        </Text>

        <NsecInputForm
          onSubmit={(nsec, success: boolean) => {
            if (success) {
              onSubmit()
              onCancel()
            }
          }}
        />
      </View>
    </ReactNativeModal>
  )
}

const styles = StyleSheet.create({
  modalStyle: {
    justifyContent: "flex-end",
  },
  modalBody: {
    backgroundColor: "#fff",
    padding: 20,
    borderRadius: 15,
    maxWidth: 350,
    alignSelf: "center",
  },
  title: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 15,
    textAlign: "center",
    color: "#333",
  },
  description: {
    fontSize: 14,
    color: "#555",
    marginBottom: 20,
    textAlign: "center",
  },
  inputContainer: {
    marginBottom: 20,
    width: 250,
  },
  inputLabel: {
    fontSize: 14,
    color: "#333",
  },
  input: {
    fontSize: 14,
    paddingVertical: 12,
    paddingHorizontal: 15,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 10,
    backgroundColor: "#f9f9f9",
    height: 10,
  },
  errorText: {
    fontSize: 12,
    color: "#d9534f",
  },
  submitButton: {
    backgroundColor: "#007bff",
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: "bold",
  },
})
