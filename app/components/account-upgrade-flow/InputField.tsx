import React, { useState } from "react"
import { makeStyles, Text, useTheme } from "@rneui/themed"
import { TextInput, TextInputProps, View } from "react-native"

type Props = {
  label: string
  errorMsg?: string
  isOptional?: boolean
} & TextInputProps

const InputField: React.FC<Props> = ({
  label,
  errorMsg,
  isOptional,
  placeholder,
  value,
  onChangeText,
}) => {
  const styles = useStyles()
  const { colors } = useTheme().theme

  const [isFocused, setIsFocused] = useState(false)

  return (
    <View style={styles.container}>
      <Text type="bl" bold>
        {label}
        {isOptional && (
          <Text type="caption" color={colors.grey2}>
            {" "}
            (Optional)
          </Text>
        )}
      </Text>
      <TextInput
        style={[styles.input, isFocused ? { borderColor: colors.primary } : {}]}
        placeholder={placeholder}
        value={value}
        onChangeText={onChangeText}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
      />
      {!!errorMsg && (
        <Text type="caption" color={colors.red}>
          {errorMsg}
        </Text>
      )}
    </View>
  )
}

export default InputField

const useStyles = makeStyles(({ colors }) => ({
  container: {
    marginBottom: 15,
  },
  input: {
    padding: 15,
    marginTop: 5,
    marginBottom: 2,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.grey4,
    backgroundColor: colors.grey5,
    fontSize: 16,
    fontFamily: "Sora-Regular",
  },
}))
