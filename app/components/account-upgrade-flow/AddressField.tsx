import React, { useEffect, useRef, useState } from "react"
import { Modal, Platform, TouchableOpacity, View } from "react-native"
import { makeStyles, Text, useTheme } from "@rneui/themed"
import {
  GooglePlacesAutocomplete,
  GooglePlacesAutocompleteRef,
} from "react-native-google-places-autocomplete"
import { useSafeAreaInsets } from "react-native-safe-area-context"

// components
import { PrimaryBtn } from "../buttons"

// env
import { GOOGLE_PLACE_API_KEY } from "@env"

type Props = {
  label: string
  placeholder: string
  value?: string
  errorMsg?: string
  onAddressSelect: (address: string, lat?: number, lng?: number) => void
}

const AddressField: React.FC<Props> = ({
  label,
  placeholder,
  value,
  errorMsg,
  onAddressSelect,
}) => {
  const styles = useStyles()
  const { colors } = useTheme().theme
  const { bottom, top } = useSafeAreaInsets()

  const ref = useRef<GooglePlacesAutocompleteRef>(null)
  const [isFocused, setIsFocused] = useState(false)
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    if (isVisible && ref.current) {
      ref.current.focus()
    }
  }, [isVisible, ref.current])

  return (
    <View style={styles.container}>
      <Text type="bl" bold>
        {label}
      </Text>
      <TouchableOpacity style={styles.input} onPress={() => setIsVisible(true)}>
        <Text type="bl" color={value ? colors.black : colors.placeholder}>
          {!!value ? value : placeholder}
        </Text>
      </TouchableOpacity>
      {!!errorMsg && (
        <Text type="caption" color={colors.red}>
          {errorMsg}
        </Text>
      )}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isVisible}
        onRequestClose={() => setIsVisible(false)}
      >
        <View style={[styles.modal, { paddingTop: top, paddingBottom: bottom }]}>
          <GooglePlacesAutocomplete
            ref={ref}
            listViewDisplayed="auto"
            placeholder={placeholder}
            onFail={(err) => console.log("Google places auto complete", err)}
            onNotFound={() => console.log("Google places auto complete not found")}
            fetchDetails={true}
            onPress={(data, details) => {
              setIsVisible(false)
              onAddressSelect(
                data.description,
                details?.geometry.location.lat,
                details?.geometry.location.lng,
              )
            }}
            query={{
              key: GOOGLE_PLACE_API_KEY,
              language: "en",
            }}
            styles={{
              textInput: [
                styles.googlePlace,
                isFocused ? { borderColor: colors.primary } : {},
              ],
            }}
            textInputProps={{
              onFocus: () => setIsFocused(true),
              onBlur: () => setIsFocused(false),
            }}
          />
          <PrimaryBtn label="Cancel" onPress={() => setIsVisible(false)} />
        </View>
      </Modal>
    </View>
  )
}

export default AddressField

const useStyles = makeStyles(({ colors }) => ({
  container: {
    marginBottom: 15,
  },
  input: {
    paddingHorizontal: 15,
    paddingVertical: 20,
    marginTop: 5,
    marginBottom: 2,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.grey4,
    backgroundColor: colors.grey5,
  },
  modal: {
    flex: 1,
    backgroundColor: colors.white,
    paddingHorizontal: 20,
  },
  googlePlace: {
    height: Platform.OS === "ios" ? 51 : 60,
    paddingHorizontal: 15,
    padding: 20,
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
