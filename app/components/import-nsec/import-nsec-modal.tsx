import React, { useState } from "react"
import { useTheme, Text, Input, Button, makeStyles } from "@rneui/themed"
import { View, StyleSheet, Alert, Dimensions } from "react-native"
import ReactNativeModal from "react-native-modal"
import { NsecInputForm } from "./import-nsec-form"

interface ImportNsecModalProps {
  isActive: boolean
  onCancel: () => void
  onSubmit: () => void
  descriptionText?: string
}

export const ImportNsecModal: React.FC<ImportNsecModalProps> = ({
  isActive,
  onCancel,
  onSubmit,
  descriptionText,
}) => {
  const {
    theme: { colors },
  } = useTheme()
  const styles = useStyles()

  const defaultText =
    "You are logged into another device. Please import your nsec from the other device to continue using the chat feature."
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
        <Text style={styles.title}>Import Your Notr Secret Key</Text>
        <Text style={styles.description}>
          {descriptionText ? descriptionText : defaultText}
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

const useStyles = makeStyles((theme) => {
  return {
    modalStyle: {
      justifyContent: "flex-end",
    },
    modalBody: {
      padding: 20,
      borderRadius: 15,
      maxWidth: 350,
      alignSelf: "center",
      backgroundColor: theme.colors.white,
    },
    title: {
      fontSize: 18,
      fontWeight: "bold",
      marginBottom: 15,
      textAlign: "center",
    },
    description: {
      fontSize: 14,
      color: theme.colors.grey0,
      marginBottom: 20,
      textAlign: "center",
    },
    inputContainer: {
      marginBottom: 20,
      width: 250,
    },
    inputLabel: {
      fontSize: 14,
    },
    input: {
      fontSize: 14,
      paddingVertical: 12,
      paddingHorizontal: 15,
      borderWidth: 1,
      borderRadius: 10,
      height: 10,
    },
  }
})
