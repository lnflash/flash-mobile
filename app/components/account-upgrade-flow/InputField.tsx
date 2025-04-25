import React from "react"
import { makeStyles, Text } from "@rneui/themed"
import { TextInput, TextInputProps, View } from "react-native"

type Props = {
  label: string
} & TextInputProps

const InputField: React.FC<Props> = ({ label, placeholder, value, onChangeText }) => {
  const styles = useStyles()

  return (
    <View>
      <Text type="bl" bold>
        {label}
      </Text>
      <TextInput
        style={styles.input}
        placeholder={placeholder}
        value={value}
        onChangeText={onChangeText}
      />
    </View>
  )
}

export default InputField

const useStyles = makeStyles(({ colors }) => ({
  input: {
    padding: 15,
    marginTop: 5,
    marginBottom: 15,
    borderRadius: 10,
    backgroundColor: colors.grey5,
    fontSize: 16,
    fontFamily: "Sora-Regular",
  },
}))
