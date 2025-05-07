import React, { useEffect, useState } from "react"
import { View } from "react-native"
import { makeStyles } from "@rneui/themed"
import { StackScreenProps } from "@react-navigation/stack"
import { RootStackParamList } from "@app/navigation/stack-param-lists"
import { AccountLevel, PhoneCodeChannelType } from "@app/graphql/generated"
import { parsePhoneNumber } from "libphonenumber-js/mobile"

// components
import { Screen } from "@app/components/screen"
import { PrimaryBtn } from "@app/components/buttons"
import { InputField, PhoneNumber } from "@app/components/account-upgrade-flow"

// store
import { useAppDispatch, useAppSelector } from "@app/store/redux"
import { setPersonalInfo } from "@app/store/redux/slices/accountUpgradeSlice"

// hooks
import {
  RequestPhoneCodeStatus,
  useRequestPhoneCodeLogin,
} from "../phone-auth-screen/request-phone-code-login"
import { useLevel } from "@app/graphql/level-context"
import { useI18nContext } from "@app/i18n/i18n-react"
import { useActivityIndicator } from "@app/hooks"

type Props = StackScreenProps<RootStackParamList, "PersonalInformation">

const PersonalInformation: React.FC<Props> = ({ navigation }) => {
  const dispatch = useAppDispatch()
  const styles = useStyles()
  const { currentLevel } = useLevel()
  const { LL } = useI18nContext()
  const { toggleActivityIndicator } = useActivityIndicator()

  const [fullNameErr, setFullNameErr] = useState<string>()
  const [phoneNumberErr, setPhoneNumberErr] = useState<string>()
  const {
    id,
    personalInfo: { fullName, countryCode, phoneNumber, email },
  } = useAppSelector((state) => state.accountUpgrade)

  const {
    submitPhoneNumber,
    captchaLoading,
    status,
    setPhoneNumber,
    isSmsSupported,
    isWhatsAppSupported,
    phoneCodeChannel,
    error,
    validatedPhoneNumber,
    setCountryCode,
  } = useRequestPhoneCodeLogin()

  useEffect(() => {
    if (
      status === RequestPhoneCodeStatus.CompletingCaptcha ||
      status === RequestPhoneCodeStatus.RequestingCode
    ) {
      toggleActivityIndicator(true)
    } else {
      toggleActivityIndicator(false)
    }
  }, [status])

  useEffect(() => {
    if (status === RequestPhoneCodeStatus.SuccessRequestingCode) {
      navigation.navigate("Validation", {
        phone: validatedPhoneNumber || "",
        channel: phoneCodeChannel,
      })
    }
  }, [status, phoneCodeChannel, validatedPhoneNumber, navigation])

  const onPressNext = async (channel?: PhoneCodeChannelType) => {
    try {
      let hasError = false
      const parsedPhoneNumber = parsePhoneNumber(phoneNumber || "", countryCode)
      if (fullName && fullName?.length < 2) {
        setFullNameErr("Name must be at least 2 characters")
        hasError = true
      }
      if (!parsedPhoneNumber?.isValid()) {
        setPhoneNumberErr("Please enter a valid phone number")
        hasError = true
      }
      if (!hasError) {
        if (currentLevel === AccountLevel.Zero && channel) {
          submitPhoneNumber(channel)
        } else {
          navigation.navigate("BusinessInformation")
        }
      }
    } catch (err) {
      console.log("Personal information error: ", err)
      setFullNameErr("Name must be at least 2 characters")
      setPhoneNumberErr("Please enter a valid phone number")
    }
  }

  return (
    <Screen>
      <View style={styles.container}>
        <InputField
          label="Full Name"
          placeholder="John Doe"
          value={fullName}
          errorMsg={fullNameErr}
          onChangeText={(val) => {
            setFullNameErr(undefined)
            dispatch(setPersonalInfo({ fullName: val }))
          }}
        />
        <PhoneNumber
          countryCode={countryCode}
          phoneNumber={phoneNumber}
          errorMsg={phoneNumberErr}
          disabled={!!id}
          setCountryCode={(val) => {
            setPhoneNumberErr(undefined)
            setCountryCode(val)
            dispatch(setPersonalInfo({ countryCode: val }))
          }}
          setPhoneNumber={(val) => {
            setPhoneNumberErr(undefined)
            setPhoneNumber(val)
            dispatch(setPersonalInfo({ phoneNumber: val }))
          }}
        />
        <InputField
          label="Email Address"
          isOptional={true}
          placeholder="your.email@example.com"
          value={email}
          onChangeText={(val) => dispatch(setPersonalInfo({ email: val }))}
        />
      </View>
      <View style={styles.btn}>
        {currentLevel === AccountLevel.Zero ? (
          <>
            {isSmsSupported && (
              <PrimaryBtn
                label={LL.PhoneLoginInitiateScreen.sms()}
                disabled={!fullName || !phoneNumber}
                loading={captchaLoading && phoneCodeChannel === PhoneCodeChannelType.Sms}
                onPress={() => onPressNext(PhoneCodeChannelType.Sms)}
                btnStyle={isWhatsAppSupported ? { marginBottom: 10 } : {}}
              />
            )}
            {isWhatsAppSupported && (
              <PrimaryBtn
                type={isSmsSupported ? "outline" : "solid"}
                label={LL.PhoneLoginInitiateScreen.whatsapp()}
                disabled={!fullName || !phoneNumber}
                loading={
                  captchaLoading && phoneCodeChannel === PhoneCodeChannelType.Whatsapp
                }
                onPress={() => onPressNext(PhoneCodeChannelType.Whatsapp)}
              />
            )}
          </>
        ) : (
          <PrimaryBtn
            label="Next"
            disabled={!fullName || !phoneNumber}
            onPress={onPressNext}
          />
        )}
      </View>
    </Screen>
  )
}

export default PersonalInformation

const useStyles = makeStyles(({ colors }) => ({
  container: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  btn: {
    marginBottom: 10,
    marginHorizontal: 20,
  },
}))
