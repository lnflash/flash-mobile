import React, { useMemo } from "react"
import { TouchableOpacity, View } from "react-native"
import { Input, makeStyles, Text, useTheme } from "@rneui/themed"
import {
  CountryCode as PhoneNumberCountryCode,
  getCountryCallingCode,
} from "libphonenumber-js/mobile"
import CountryPicker, {
  DARK_THEME,
  DEFAULT_THEME,
  Flag,
  CountryCode,
} from "react-native-country-picker-modal"
import { PhoneCodeChannelType, useSupportedCountriesQuery } from "@app/graphql/generated"

const DEFAULT_COUNTRY_CODE = "JM"
const PLACEHOLDER_PHONE_NUMBER = "123-456-7890"

type Props = {
  title: string
  countryCode?: CountryCode
  phoneNumber?: string
  setCountryCode: (countryCode: CountryCode) => void
  setPhoneNumber: (val: string) => void
}

const PhoneNumberInput: React.FC<Props> = ({
  title,
  countryCode,
  phoneNumber,
  setCountryCode,
  setPhoneNumber,
}) => {
  const styles = useStyles()
  const { mode } = useTheme().theme

  const { data, loading } = useSupportedCountriesQuery()
  const { isWhatsAppSupported, isSmsSupported, supportedCountries } = useMemo(() => {
    const currentCountry = data?.globals?.supportedCountries.find(
      (country) => country.id === countryCode,
    )

    const supportedCountries = (data?.globals?.supportedCountries.map(
      (country) => country.id,
    ) || []) as CountryCode[]

    const isWhatsAppSupported =
      currentCountry?.supportedAuthChannels.includes(PhoneCodeChannelType.Whatsapp) ||
      false
    const isSmsSupported =
      currentCountry?.supportedAuthChannels.includes(PhoneCodeChannelType.Sms) || false

    return {
      isWhatsAppSupported,
      isSmsSupported,
      supportedCountries,
    }
  }, [data?.globals, countryCode])

  return (
    <View style={styles.wrapper}>
      <Text type={"p1"} style={styles.header}>
        {title}
      </Text>
      <View style={styles.inputContainer}>
        <CountryPicker
          theme={mode === "dark" ? DARK_THEME : DEFAULT_THEME}
          countryCode={countryCode || DEFAULT_COUNTRY_CODE}
          countryCodes={supportedCountries as any}
          onSelect={(country) => setCountryCode(country.cca2)}
          renderFlagButton={({ countryCode, onOpen }) =>
            countryCode && (
              <TouchableOpacity style={styles.countryPickerButtonStyle} onPress={onOpen}>
                <Flag countryCode={countryCode} flagSize={24} />
                <Text type="p1">
                  +{getCountryCallingCode(countryCode as PhoneNumberCountryCode)}
                </Text>
              </TouchableOpacity>
            )
          }
          withCallingCodeButton={true}
          withFilter={true}
          withCallingCode={true}
          filterProps={{
            autoFocus: true,
          }}
        />
        <Input
          placeholder={PLACEHOLDER_PHONE_NUMBER}
          containerStyle={styles.inputComponentContainerStyle}
          inputContainerStyle={styles.inputContainerStyle}
          renderErrorMessage={false}
          textContentType="telephoneNumber"
          keyboardType="phone-pad"
          value={phoneNumber}
          onChangeText={setPhoneNumber}
          autoFocus={true}
        />
      </View>
    </View>
  )
}

export default PhoneNumberInput

const useStyles = makeStyles(({ colors }) => ({
  wrapper: {
    marginBottom: 10,
  },
  header: {
    marginBottom: 5,
  },
  inputContainer: {
    flexDirection: "row",
    marginBottom: 10,
  },
  countryPickerButtonStyle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderRadius: 10,
    borderColor: colors.border02,
    paddingHorizontal: 10,
  },
  inputComponentContainerStyle: {
    flex: 1,
    marginLeft: 10,
    paddingLeft: 0,
    paddingRight: 0,
  },
  inputContainerStyle: {
    borderWidth: 1,
    borderRadius: 10,
    borderColor: colors.border02,
    paddingHorizontal: 10,
  },
}))
