import React, { useEffect, useState } from "react"
import { ActivityIndicator, View } from "react-native"
import { StackScreenProps } from "@react-navigation/stack"
import { TouchableOpacity } from "react-native-gesture-handler"
import { makeStyles, useTheme, Text, Input } from "@rneui/themed"
import CountryPicker, {
  CountryCode,
  DARK_THEME,
  DEFAULT_THEME,
  Flag,
} from "react-native-country-picker-modal"
import {
  CountryCode as PhoneNumberCountryCode,
  getCountryCallingCode,
} from "libphonenumber-js/mobile"
import { useI18nContext } from "@app/i18n/i18n-react"

// components
import { ContactSupportButton } from "@app/components/contact-support-button/contact-support-button"
import { GaloyErrorBox } from "@app/components/atomic/galoy-error-box"
import { PrimaryBtn } from "@app/components/buttons"
import { Screen } from "../../components/screen"

// utils
import {
  ErrorType,
  RequestPhoneCodeStatus,
  useRequestPhoneCodeLogin,
} from "./request-phone-code-login"

// types
import { PhoneCodeChannelType } from "@app/graphql/generated"
import { PhoneValidationStackParamList } from "@app/navigation/stack-param-lists"

const DEFAULT_COUNTRY_CODE = "SV"
const PLACEHOLDER_PHONE_NUMBER = "123-456-7890"

type Props = StackScreenProps<PhoneValidationStackParamList, "phoneLoginInitiate">

export const PhoneLoginInitiateScreen: React.FC<Props> = ({ navigation, route }) => {
  const { LL } = useI18nContext()
  const { colors, mode } = useTheme().theme
  const styles = useStyles()

  // Check if this is an invite signup
  const hasInviteToken = !!(route?.params as any)?.inviteToken
  console.log("PhoneLoginInitiate: Route params:", JSON.stringify(route?.params))
  console.log("PhoneLoginInitiate: Has invite token:", hasInviteToken)

  const {
    submitPhoneNumber,
    captchaLoading,
    status,
    setPhoneNumber,
    isSmsSupported,
    isWhatsAppSupported,
    phoneInputInfo,
    phoneCodeChannel,
    error,
    validatedPhoneNumber,
    setStatus,
    setCountryCode,
    supportedCountries,
    loadingSupportedCountries,
  } = useRequestPhoneCodeLogin(hasInviteToken)

  // Handle pre-filled phone from invite
  const [hasPreFilled, setHasPreFilled] = React.useState(false)
  const [targetCountryCode, setTargetCountryCode] = React.useState<CountryCode | undefined>()

  React.useEffect(() => {
    const handlePrefilledPhone = async () => {
      const params = route?.params as any

      // Only pre-fill once and if we have the phone number parameter
      if (params?.prefilledPhone && !hasPreFilled) {
        setHasPreFilled(true)

        try {
          // Import parsePhoneNumber at the top of the file
          const { parsePhoneNumber } = await import("libphonenumber-js/mobile")

          // Check for specific Caribbean country codes
          if (params.prefilledPhone.startsWith("+1876")) {
            // Jamaica
            const numberWithoutCountryCode = params.prefilledPhone.replace("+1", "")
            setPhoneNumber(numberWithoutCountryCode)
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
                const cleanNumber = params.prefilledPhone.replace(/[^\d]/g, '')
                setPhoneNumber(cleanNumber)
              }
            }
          }

          // Store invite token for later redemption
          if (params.inviteToken) {
            const AsyncStorage = (await import("@react-native-async-storage/async-storage")).default
            await AsyncStorage.setItem("pendingInviteToken", params.inviteToken)
          }
        } catch (error) {
          console.error("Error parsing pre-filled phone:", error)
          // If all else fails, just set what we have
          const cleanNumber = params.prefilledPhone.replace(/[^\d]/g, '')
          setPhoneNumber(cleanNumber)
        }
      }
    }

    handlePrefilledPhone()
  }, [route?.params, setPhoneNumber, hasPreFilled])

  // Set country code when status changes and we have a target
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

  useEffect(() => {
    console.log("PhoneLoginInitiate: Status changed to:", status)
    if (status === RequestPhoneCodeStatus.SuccessRequestingCode) {
      console.log("PhoneLoginInitiate: Success! Navigating to validation screen")
      console.log("Phone:", validatedPhoneNumber)
      console.log("Channel:", phoneCodeChannel)
      setStatus(RequestPhoneCodeStatus.InputtingPhoneNumber)
      navigation.navigate("phoneLoginValidate", {
        phone: validatedPhoneNumber || "",
        channel: phoneCodeChannel,
      })
    }
  }, [status, phoneCodeChannel, validatedPhoneNumber, navigation, setStatus])

  let errorMessage: string | undefined
  if (error) {
    switch (error) {
      case ErrorType.FailedCaptchaError:
        errorMessage = LL.PhoneLoginInitiateScreen.errorRequestingCaptcha()
        break
      case ErrorType.RequestCodeError:
        errorMessage = LL.PhoneLoginInitiateScreen.errorRequestingCode()
        break
      case ErrorType.TooManyAttemptsError:
        errorMessage = LL.errors.tooManyRequestsPhoneCode()
        break
      case ErrorType.InvalidPhoneNumberError:
        errorMessage = LL.PhoneLoginInitiateScreen.errorInvalidPhoneNumber()
        break
      case ErrorType.UnsupportedCountryError:
        errorMessage = LL.PhoneLoginInitiateScreen.errorUnsupportedCountry()
        break
    }
  }
  if (!isSmsSupported && !isWhatsAppSupported) {
    errorMessage = LL.PhoneLoginInitiateScreen.errorUnsupportedCountry()
  }

  if (status === RequestPhoneCodeStatus.LoadingCountryCode || loadingSupportedCountries) {
    return (
      <Screen style={styles.loadingView}>
        <ActivityIndicator size="large" color={colors.primary} />
      </Screen>
    )
  }

  return (
    <Screen
      preset="scroll"
      style={styles.screenStyle}
      keyboardOffset="navigationHeader"
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.viewWrapper}>
        <Text type={"p1"} style={styles.header}>
          {LL.PhoneLoginInitiateScreen.header()}
        </Text>
        <View style={styles.inputContainer}>
          <CountryPicker
            theme={mode === "dark" ? DARK_THEME : DEFAULT_THEME}
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
          <>
            <GaloyErrorBox errorMessage={errorMessage} />
            <ContactSupportButton containerStyle={styles.contactSupportButton} />
          </>
        )}
      </View>
      {isSmsSupported && (
        <PrimaryBtn
          label={LL.PhoneLoginInitiateScreen.sms()}
          loading={captchaLoading && phoneCodeChannel === PhoneCodeChannelType.Sms}
          onPress={() => {
            console.log("SMS button pressed")
            submitPhoneNumber(PhoneCodeChannelType.Sms)
          }}
          btnStyle={isWhatsAppSupported ? { marginBottom: 10 } : {}}
        />
      )}
      {isWhatsAppSupported && (
        <PrimaryBtn
          type={isSmsSupported ? "outline" : "solid"}
          label={LL.PhoneLoginInitiateScreen.whatsapp()}
          loading={captchaLoading && phoneCodeChannel === PhoneCodeChannelType.Whatsapp}
          onPress={() => {
            console.log("WhatsApp button pressed")
            submitPhoneNumber(PhoneCodeChannelType.Whatsapp)
          }}
        />
      )}
    </Screen>
  )
}

const useStyles = makeStyles(({ colors }) => ({
  screenStyle: {
    padding: 20,
    flexGrow: 1,
  },
  inputContainer: {
    minHeight: 48,
    flexDirection: "row",
    marginBottom: 20,
  },
  header: {
    marginBottom: 20,
  },
  viewWrapper: {
    flex: 1,
  },
  countryPickerButtonStyle: {
    minWidth: 110,
    borderColor: colors.border02,
    borderWidth: 1,
    borderRadius: 10,
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
    borderWidth: 1,
    paddingHorizontal: 10,
    borderColor: colors.border02,
    borderRadius: 10,
  },
  contactSupportButton: {
    marginTop: 10,
    backgroundColor: colors.button01,
  },
  loadingView: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
}))
