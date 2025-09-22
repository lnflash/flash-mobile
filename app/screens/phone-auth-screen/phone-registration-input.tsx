import * as React from "react"
import { ActivityIndicator, View } from "react-native"
import CountryPicker, {
  CountryCode,
  DARK_THEME,
  DEFAULT_THEME,
  Flag,
} from "react-native-country-picker-modal"
import {
  CountryCode as PhoneNumberCountryCode,
  getCountryCallingCode,
  parsePhoneNumber,
} from "libphonenumber-js/mobile"
import { ContactSupportButton } from "@app/components/contact-support-button/contact-support-button"
import { useI18nContext } from "@app/i18n/i18n-react"
import { makeStyles, useTheme, Text, Input } from "@rneui/themed"
import { Screen } from "../../components/screen"
import {
  ErrorType,
  RequestPhoneCodeStatus,
  useRequestPhoneCodeRegistration,
} from "./request-phone-code-registration"
import { GaloyPrimaryButton } from "@app/components/atomic/galoy-primary-button"
import { GaloySecondaryButton } from "@app/components/atomic/galoy-secondary-button"
import { GaloyErrorBox } from "@app/components/atomic/galoy-error-box"
import { PhoneCodeChannelType } from "@app/graphql/generated"
import { TouchableOpacity } from "react-native-gesture-handler"
import { RouteProp, useRoute } from "@react-navigation/native"
import { RootStackParamList } from "@app/navigation/stack-param-lists"
import AsyncStorage from "@react-native-async-storage/async-storage"

const DEFAULT_COUNTRY_CODE = "SV"
const PLACEHOLDER_PHONE_NUMBER = "123-456-7890"

type Props = {
  route?: RouteProp<RootStackParamList, "phoneRegistrationInitiate">
}

export const PhoneRegistrationInitiateScreen: React.FC<Props> = () => {
  const route = useRoute<RouteProp<RootStackParamList, "phoneRegistrationInitiate">>()
  const styles = useStyles()

  const {
    theme: { colors, mode: themeMode },
  } = useTheme()

  const {
    submitPhoneNumber,
    status,
    setPhoneNumber,
    isSmsSupported,
    isWhatsAppSupported,
    phoneInputInfo,
    phoneCodeChannel,
    error,
    setCountryCode,
    supportedCountries,
  } = useRequestPhoneCodeRegistration()

  const { LL } = useI18nContext()

  // State to track if we've already pre-filled
  const [hasPreFilled, setHasPreFilled] = React.useState(false)
  const [targetCountryCode, setTargetCountryCode] = React.useState<
    CountryCode | undefined
  >()

  // Handle pre-filled phone from invite
  React.useEffect(() => {
    const handlePrefilledPhone = async () => {
      const params = route.params as any

      // Only pre-fill once and if we have the phone number parameter
      if (params?.prefilledPhone && !hasPreFilled) {
        setHasPreFilled(true)

        try {
          // First check for specific country codes that might be problematic
          // Jamaica numbers start with +1876
          if (params.prefilledPhone.startsWith("+1876")) {
            // Jamaica - keep the area code 876 as part of the phone number
            // Remove only the +1 country code
            const numberWithoutCountryCode = params.prefilledPhone.replace("+1", "")

            // Set phone number immediately
            setPhoneNumber(numberWithoutCountryCode)

            // Store the target country code to set later
            setTargetCountryCode("JM" as CountryCode)
          } else if (params.prefilledPhone.startsWith("+1868")) {
            // Trinidad and Tobago
            const numberWithoutCountryCode = params.prefilledPhone.replace("+1", "")
            setPhoneNumber(numberWithoutCountryCode)
            setTargetCountryCode("TT" as CountryCode)
          } else if (params.prefilledPhone.startsWith("+1246")) {
            // Barbados
            const numberWithoutCountryCode = params.prefilledPhone.replace("+1", "")
            setPhoneNumber(numberWithoutCountryCode)
            setTargetCountryCode("BB" as CountryCode)
          } else {
            // Try parsing with libphonenumber
            const parsed = parsePhoneNumber(params.prefilledPhone)
            if (parsed && parsed.isValid()) {
              const countryCode = parsed.country as CountryCode
              const nationalNumber = parsed.nationalNumber

              setTargetCountryCode(countryCode)
              setPhoneNumber(nationalNumber)
            } else {
              // If parsing fails, try to extract what we can
              if (params.prefilledPhone.startsWith("+1")) {
                // Default to US for other +1 numbers
                setTargetCountryCode("US" as CountryCode)
                const numberWithoutCountry = params.prefilledPhone.replace("+1", "")
                setPhoneNumber(numberWithoutCountry)
              } else {
                // Just set the number without country code
                const cleanNumber = params.prefilledPhone.replace(/[^\d]/g, "")
                setPhoneNumber(cleanNumber)
              }
            }
          }

          // Store invite token for later redemption
          if (params.inviteToken) {
            await AsyncStorage.setItem("pendingInviteToken", params.inviteToken)
          }
        } catch (error) {
          console.error("Error parsing pre-filled phone:", error)
          // If all else fails, just set what we have
          const cleanNumber = params.prefilledPhone.replace(/[^\d]/g, "")
          setPhoneNumber(cleanNumber)
        }
      }
    }

    handlePrefilledPhone()
  }, [route.params, setPhoneNumber, hasPreFilled])

  // Set country code when status changes to InputtingPhoneNumber and we have a target
  React.useEffect(() => {
    if (status === RequestPhoneCodeStatus.InputtingPhoneNumber && targetCountryCode) {
      // Add a small delay to ensure the component is ready
      setTimeout(() => {
        setCountryCode(targetCountryCode)
        // Clear the target after setting
        setTargetCountryCode(undefined)
      }, 100)
    }
  }, [status, targetCountryCode, setCountryCode])

  if (status === RequestPhoneCodeStatus.LoadingCountryCode) {
    return (
      <Screen>
        <View style={styles.loadingView}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </Screen>
    )
  }

  let errorMessage: string | undefined
  if (error) {
    switch (error) {
      case ErrorType.RequestCodeError:
        errorMessage = LL.PhoneRegistrationInitiateScreen.errorRequestingCode()
        break
      case ErrorType.TooManyAttemptsError:
        errorMessage = LL.errors.tooManyRequestsPhoneCode()
        break
      case ErrorType.InvalidPhoneNumberError:
        errorMessage = LL.PhoneRegistrationInitiateScreen.errorInvalidPhoneNumber()
        break
      case ErrorType.UnsupportedCountryError:
        errorMessage = LL.PhoneRegistrationInitiateScreen.errorUnsupportedCountry()
        console.log("Supported Countries", supportedCountries)
        break
    }
  }
  if (!isSmsSupported && !isWhatsAppSupported) {
    errorMessage = LL.PhoneRegistrationInitiateScreen.errorUnsupportedCountry()
  }

  let PrimaryButton = undefined
  let SecondaryButton = undefined
  switch (true) {
    case isSmsSupported && isWhatsAppSupported:
      PrimaryButton = (
        <GaloyPrimaryButton
          title={LL.PhoneRegistrationInitiateScreen.sms()}
          loading={
            status === RequestPhoneCodeStatus.RequestingCode &&
            phoneCodeChannel === PhoneCodeChannelType.Sms
          }
          onPress={() => submitPhoneNumber(PhoneCodeChannelType.Sms)}
        />
      )
      SecondaryButton = (
        <GaloySecondaryButton
          title={LL.PhoneRegistrationInitiateScreen.whatsapp()}
          containerStyle={styles.whatsAppButton}
          loading={
            status === RequestPhoneCodeStatus.RequestingCode &&
            phoneCodeChannel === PhoneCodeChannelType.Whatsapp
          }
          onPress={() => submitPhoneNumber(PhoneCodeChannelType.Whatsapp)}
        />
      )
      break
    case isSmsSupported && !isWhatsAppSupported:
      PrimaryButton = (
        <GaloyPrimaryButton
          title={LL.PhoneRegistrationInitiateScreen.sms()}
          loading={
            status === RequestPhoneCodeStatus.RequestingCode &&
            phoneCodeChannel === PhoneCodeChannelType.Sms
          }
          onPress={() => submitPhoneNumber(PhoneCodeChannelType.Sms)}
        />
      )
      break
    case !isSmsSupported && isWhatsAppSupported:
      PrimaryButton = (
        <GaloyPrimaryButton
          title={LL.PhoneRegistrationInitiateScreen.whatsapp()}
          loading={
            status === RequestPhoneCodeStatus.RequestingCode &&
            phoneCodeChannel === PhoneCodeChannelType.Whatsapp
          }
          onPress={() => submitPhoneNumber(PhoneCodeChannelType.Whatsapp)}
        />
      )
      break
  }

  return (
    <Screen
      preset="scroll"
      style={styles.screenStyle}
      keyboardOffset="navigationHeader"
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.viewWrapper}>
        <View style={styles.textContainer}>
          <Text type={"p1"}>{LL.PhoneRegistrationInitiateScreen.header()}</Text>
        </View>

        <View style={styles.inputContainer}>
          <CountryPicker
            theme={themeMode === "dark" ? DARK_THEME : DEFAULT_THEME}
            countryCode={
              (phoneInputInfo?.countryCode || DEFAULT_COUNTRY_CODE) as CountryCode
            }
            countryCodes={supportedCountries as CountryCode[]}
            onSelect={(country) => setCountryCode(country.cca2 as PhoneNumberCountryCode)}
            renderFlagButton={({ countryCode, onOpen }) => {
              return (
                countryCode && (
                  <TouchableOpacity
                    style={styles.countryPickerButtonStyle}
                    onPress={onOpen}
                  >
                    <Flag countryCode={countryCode} flagSize={24} />
                    <Text type="p1">
                      +{getCountryCallingCode(countryCode as PhoneNumberCountryCode)}
                    </Text>
                  </TouchableOpacity>
                )
              )
            }}
            withCallingCodeButton={true}
            withFilter={true}
            filterProps={{
              autoFocus: true,
            }}
            withCallingCode={true}
          />
          <Input
            placeholder={PLACEHOLDER_PHONE_NUMBER}
            containerStyle={styles.inputComponentContainerStyle}
            inputContainerStyle={styles.inputContainerStyle}
            renderErrorMessage={false}
            textContentType="telephoneNumber"
            keyboardType="phone-pad"
            value={phoneInputInfo?.rawPhoneNumber}
            onChangeText={setPhoneNumber}
            autoFocus={true}
          />
        </View>
        {errorMessage && (
          <View style={styles.errorContainer}>
            <GaloyErrorBox errorMessage={errorMessage} />
            <ContactSupportButton containerStyle={styles.contactSupportButton} />
          </View>
        )}

        <View style={styles.buttonsContainer}>
          {SecondaryButton}
          {PrimaryButton}
        </View>
      </View>
    </Screen>
  )
}

const useStyles = makeStyles(({ colors }) => ({
  screenStyle: {
    padding: 20,
    flexGrow: 1,
  },
  buttonsContainer: {
    flex: 1,
    justifyContent: "flex-end",
  },

  inputContainer: {
    marginBottom: 20,
    flexDirection: "row",
    alignItems: "stretch",
    minHeight: 48,
  },
  textContainer: {
    marginBottom: 20,
  },
  viewWrapper: { flex: 1 },

  activityIndicator: { marginTop: 12 },

  keyboardContainer: {
    paddingHorizontal: 10,
  },

  codeTextStyle: {},
  countryPickerButtonStyle: {
    minWidth: 110,
    borderColor: colors.primary5,
    borderWidth: 2,
    borderRadius: 8,
    paddingHorizontal: 10,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    flex: 1,
  },
  inputComponentContainerStyle: {
    flex: 1,
    marginLeft: 20,
    paddingLeft: 0,
    paddingRight: 0,
  },
  inputContainerStyle: {
    flex: 1,
    borderWidth: 2,
    borderBottomWidth: 2,
    paddingHorizontal: 10,
    borderColor: colors.primary5,
    borderRadius: 8,
  },
  errorContainer: {
    marginBottom: 20,
  },
  whatsAppButton: {
    marginBottom: 20,
  },
  contactSupportButton: {
    marginTop: 10,
  },

  loadingView: { flex: 1, justifyContent: "center", alignItems: "center" },
}))
