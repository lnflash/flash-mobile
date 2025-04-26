import React, { useState } from "react"
import { TextInput, View } from "react-native"
import { makeStyles, useTheme, Text } from "@rneui/themed"
import { TouchableOpacity } from "react-native-gesture-handler"
import { FlagButtonProps } from "react-native-country-picker-modal/lib/FlagButton"
import {
  CountryCode as PhoneNumberCountryCode,
  getCountryCallingCode,
} from "libphonenumber-js/mobile"
import CountryPicker, {
  CountryCode,
  DARK_THEME,
  DEFAULT_THEME,
  Flag,
} from "react-native-country-picker-modal"

// hooks
import { useI18nContext } from "@app/i18n/i18n-react"
import { useRequestPhoneCodeLogin } from "@app/screens/phone-auth-screen/request-phone-code-login"

type Props = {
  countryCode: string
  phoneNumber: string
  setPhoneNumber: (number: string) => void
  setCountryCode: (countryCode: PhoneNumberCountryCode) => void
}

const PhoneNumber: React.FC<Props> = ({
  countryCode,
  phoneNumber,
  setPhoneNumber,
  setCountryCode,
}) => {
  const styles = useStyles()
  const { mode, colors } = useTheme().theme
  const { LL } = useI18nContext()
  const { supportedCountries } = useRequestPhoneCodeLogin()

  const [isFocused, setIsFocused] = useState(false)

  const renderCountryCode = ({ countryCode, onOpen }: FlagButtonProps) => {
    return (
      countryCode && (
        <TouchableOpacity style={styles.countryPicker} onPress={onOpen}>
          <Flag countryCode={countryCode} flagSize={16} />
          <Text type="bl">
            +{getCountryCallingCode(countryCode as PhoneNumberCountryCode)}
          </Text>
        </TouchableOpacity>
      )
    )
  }

  return (
    <View>
      <Text type="bl" bold>
        Phone Number
      </Text>
      <View style={styles.container}>
        <CountryPicker
          theme={mode === "dark" ? DARK_THEME : DEFAULT_THEME}
          countryCode={countryCode as CountryCode}
          countryCodes={supportedCountries as CountryCode[]}
          onSelect={(country) => setCountryCode(country.cca2 as PhoneNumberCountryCode)}
          renderFlagButton={renderCountryCode}
          withCallingCodeButton={true}
          withFilter={true}
          filterProps={{ autoFocus: true }}
          withCallingCode={true}
        />
        <TextInput
          placeholder={"123-456-7890"}
          style={[styles.input, isFocused ? { borderColor: colors.primary } : {}]}
          textContentType="telephoneNumber"
          keyboardType="phone-pad"
          value={phoneNumber}
          onChangeText={setPhoneNumber}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
        />
      </View>
    </View>
  )
}

export default PhoneNumber

const useStyles = makeStyles(({ colors }) => ({
  container: {
    flexDirection: "row",
    marginTop: 5,
  },
  countryPicker: {
    padding: 14.5,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.grey4,
    backgroundColor: colors.grey5,
    flexDirection: "row",
    alignItems: "center",
  },
  input: {
    flex: 1,
    padding: 15,
    marginBottom: 15,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.grey4,
    backgroundColor: colors.grey5,
    fontSize: 16,
    fontFamily: "Sora-Regular",
    marginLeft: 10,
  },
}))
