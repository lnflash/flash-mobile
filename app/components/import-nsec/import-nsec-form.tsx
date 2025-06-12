import React, { useState } from "react"
import { Input, makeStyles } from "@rneui/themed"
import { View, Alert } from "react-native"
import { useUserUpdateNpubMutation } from "@app/graphql/generated"
import { importNsec } from "./utils"
import { getPublicKey, nip19 } from "nostr-tools"
import { PrimaryBtn } from "../buttons"

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
        value={nsec}
        onChangeText={handleInputChange}
        placeholder="nsec1..."
        errorMessage={error || ""}
        containerStyle={styles.inputContainer}
        inputStyle={styles.input}
        labelStyle={styles.inputLabel}
        errorStyle={styles.errorText}
      />
      <PrimaryBtn label={"Submit"} onPress={handleSubmit} />
    </View>
  )
}

const useStyles = makeStyles(({ colors }) => ({
  inputContainer: {
    width: "100%",
    maxWidth: "100%",
  },
  inputLabel: {
    fontSize: 14,
    marginBottom: 5,
    marginTop: 5,
  },
  input: {
    fontSize: 14,
    paddingVertical: 12,
    paddingHorizontal: 15,
    borderWidth: 1,
    borderRadius: 8,
    height: 40,
    borderColor: colors.grey3,
    backgroundColor: colors.white,
  },
  errorText: {
    fontSize: 12,
    color: colors.red,
  },
}))
