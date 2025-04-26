import React, { useState } from "react"
import { View } from "react-native"
import { makeStyles, Text, useTheme } from "@rneui/themed"
import { GooglePlacesAutocomplete } from "react-native-google-places-autocomplete"

type Props = {
  label: string
  placeholder: string
}

const AddressField: React.FC<Props> = ({ label, placeholder }) => {
  const styles = useStyles()
  const { colors } = useTheme().theme

  const [isFocused, setIsFocused] = useState(false)

  return (
    <View>
      <Text type="bl" bold>
        {label}
      </Text>
      <GooglePlacesAutocomplete
        styles={{
          textInput: [styles.container, isFocused ? { borderColor: colors.primary } : {}],
        }}
        placeholder={placeholder}
        onPress={(data, details = null) => {
          // 'details' is provided when fetchDetails = true
          console.log(data, details)
        }}
        query={{
          key: "YOUR API KEY",
          language: "en",
        }}
        textInputProps={{
          onFocus: () => setIsFocused(true),
          onBlur: () => setIsFocused(false),
        }}
      />
    </View>
  )
}

export default AddressField

const useStyles = makeStyles(({ colors }) => ({
  container: {
    paddingVertical: 25,
    paddingHorizontal: 15,
    marginTop: 5,
    marginBottom: 15,
    borderWidth: 1,
    borderRadius: 10,
    borderColor: colors.grey4,
    backgroundColor: colors.grey5,
    fontSize: 16,
    fontFamily: "Sora-Regular",
  },
}))
