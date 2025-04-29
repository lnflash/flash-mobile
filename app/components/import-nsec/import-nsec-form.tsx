import React, { useState } from "react"
import { useTheme, Input, Button, makeStyles } from "@rneui/themed"
import { View, StyleSheet, Alert } from "react-native"
import { useUserUpdateNpubMutation } from "@app/graphql/generated"
import { importNsec } from "./utils"
import { getPublicKey, nip19 } from "nostr-tools"

interface NsecInputFormProps {
  onSubmit: (nsec: string, success: boolean) => void
}

export const NsecInputForm: React.FC<NsecInputFormProps> = ({ onSubmit }) => {
  const [nsec, setNsec] = useState<string>("")
  const [error, setError] = useState<string | null>(null)
  const [userUpdateNpubMutation] = useUserUpdateNpubMutation()
  const styles = useStyles()

  const handleInputChange = (text: string) => {
    setNsec(text)
    setError(null)
  }

  const handleSubmit = async () => {
    let success = await importNsec(nsec, setError, async () => {
      await userUpdateNpubMutation({
        variables: {
          input: {
            npub: nip19.npubEncode(getPublicKey(nip19.decode(nsec).data as Uint8Array)),
          },
        },
      })
    })
    if (success) {
      Alert.alert("Success", "nsec imported successfully!")
    }
    onSubmit(nsec, success)
  }
  return (
    <View>
      <Input
        label="Import Private Key"
        value={nsec}
        onChangeText={handleInputChange}
        placeholder="nsec1..."
        errorMessage={error || ""}
        containerStyle={styles.inputContainer}
        inputStyle={styles.input}
        labelStyle={styles.inputLabel}
        errorStyle={styles.errorText}
      />
      <Button
        title="Submit"
        onPress={handleSubmit}
        buttonStyle={styles.submitButton}
        titleStyle={styles.submitButtonText}
      />
    </View>
  )
}

const useStyles = makeStyles(({ colors }) => ({
  inputContainer: {
    margin: 10,
    width: "100%",
    maxWidth: "100%",
  },
  inputLabel: {
    fontSize: 14,
    marginBottom: 5,
    marginTop: 5,
    color: colors._black,
  },
  input: {
    fontSize: 14,
    paddingVertical: 12,
    paddingHorizontal: 15,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 10,
    backgroundColor: "#f9f9f9",
    height: 40,
  },
  errorText: {
    fontSize: 12,
    color: "#d9534f",
  },
  submitButton: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: "bold",
  },
}))
