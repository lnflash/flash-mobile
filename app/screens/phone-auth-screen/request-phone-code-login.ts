import { useAppConfig, useGeetestCaptcha } from "@app/hooks"
import { useEffect, useMemo, useState } from "react"
import parsePhoneNumber, {
  AsYouType,
  CountryCode,
  getCountryCallingCode,
} from "libphonenumber-js/mobile"
import { logRequestAuthCode } from "@app/utils/analytics"
import { gql } from "@apollo/client"
import {
  PhoneCodeChannelType,
  useCaptchaRequestAuthCodeMutation,
  useUserPhoneRegistrationInitiateMutation,
  useSupportedCountriesQuery,
} from "@app/graphql/generated"

export const RequestPhoneCodeStatus = {
  LoadingCountryCode: "LoadingCountryCode",
  InputtingPhoneNumber: "InputtingPhoneNumber",
  CompletingCaptcha: "CompletingCaptcha",
  RequestingCode: "RequestingCode",
  SuccessRequestingCode: "SuccessRequestingCode",
  Error: "Error",
} as const

export const ErrorType = {
  InvalidPhoneNumberError: "InvalidPhoneNumberError",
  FailedCaptchaError: "FailedCaptchaError",
  TooManyAttemptsError: "TooManyAttemptsError",
  RequestCodeError: "RequestCodeError",
  UnsupportedCountryError: "UnsupportedCountryError",
} as const

import axios from "axios"

type ErrorType = (typeof ErrorType)[keyof typeof ErrorType]

export type RequestPhoneCodeStatus =
  (typeof RequestPhoneCodeStatus)[keyof typeof RequestPhoneCodeStatus]

type PhoneInputInfo = {
  countryCode: CountryCode
  countryCallingCode: string
  formattedPhoneNumber: string
  rawPhoneNumber: string
}

export type UseRequestPhoneCodeReturn = {
  submitPhoneNumber: (phoneCodeChannel: PhoneCodeChannelType) => void
  setStatus: (status: RequestPhoneCodeStatus) => void
  status: RequestPhoneCodeStatus
  phoneInputInfo?: PhoneInputInfo
  validatedPhoneNumber?: string
  isWhatsAppSupported: boolean
  isSmsSupported: boolean
  phoneCodeChannel: PhoneCodeChannelType
  error?: ErrorType
  captchaLoading: boolean
  setCountryCode: (countryCode: CountryCode) => void
  setPhoneNumber: (number: string) => void
  supportedCountries: CountryCode[]
  loadingSupportedCountries: boolean
}

export const PhoneCodeChannelToFriendlyName = {
  [PhoneCodeChannelType.Sms]: "SMS",
  [PhoneCodeChannelType.Whatsapp]: "WhatsApp",
}

gql`
  mutation captchaRequestAuthCode($input: CaptchaRequestAuthCodeInput!) {
    captchaRequestAuthCode(input: $input) {
      errors {
        message
        code
      }
      success
    }
  }

  query supportedCountries {
    globals {
      supportedCountries {
        id
        supportedAuthChannels
      }
    }
  }
`

export const useRequestPhoneCodeLogin = (
  isInviteSignup = false,
): UseRequestPhoneCodeReturn => {
  console.log("useRequestPhoneCodeLogin: isInviteSignup =", isInviteSignup)
  const [status, setStatus] = useState<RequestPhoneCodeStatus>(
    RequestPhoneCodeStatus.LoadingCountryCode,
  )
  const [countryCode, setCountryCode] = useState<CountryCode | undefined>()
  const [rawPhoneNumber, setRawPhoneNumber] = useState<string>("")
  const [validatedPhoneNumber, setValidatedPhoneNumber] = useState<string | undefined>()
  const [phoneCodeChannel, setPhoneCodeChannel] = useState<PhoneCodeChannelType>(
    PhoneCodeChannelType.Sms,
  )
  const { appConfig } = useAppConfig()
  const skipRequestPhoneCode = appConfig.galoyInstance.name === "Local"

  const [error, setError] = useState<ErrorType | undefined>()
  const [captchaRequestAuthCode] = useCaptchaRequestAuthCodeMutation()
  const [userPhoneRegistrationInitiate] = useUserPhoneRegistrationInitiateMutation()

  const { data, loading: loadingSupportedCountries } = useSupportedCountriesQuery()
  const { isWhatsAppSupported, isSmsSupported, allSupportedCountries } = useMemo(() => {
    const currentCountry = data?.globals?.supportedCountries.find(
      (country) => country.id === countryCode,
    )

    const allSupportedCountries = (data?.globals?.supportedCountries.map(
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
      allSupportedCountries,
    }
  }, [data?.globals, countryCode])

  const {
    geetestError,
    geetestValidationData,
    loadingRegisterCaptcha,
    registerCaptcha,
    resetError,
    resetValidationData,
  } = useGeetestCaptcha()

  useEffect(() => {
    const getCountryCodeFromIP = async () => {
      let defaultCountryCode = "JM" as CountryCode
      try {
        const response = await axios({
          method: "get",
          url: "https://ipapi.co/json/",
          timeout: 5000,
        })
        const data = response.data

        if (data && data.country_code) {
          const countryCode = data.country_code
          defaultCountryCode = countryCode
        } else {
          console.warn("no data or country_code in response")
        }
      } catch (error) {
        // console.error(error)
        // Handle the error gracefully by not logging it
      }

      // Only set country code if not already set (e.g., from pre-filled invite)
      setCountryCode((prevCountryCode) => {
        if (prevCountryCode) {
          return prevCountryCode
        }
        return defaultCountryCode
      })
      setStatus(RequestPhoneCodeStatus.InputtingPhoneNumber)
    }

    getCountryCodeFromIP()
  }, [])

  const setPhoneNumber = (number: string) => {
    if (status === RequestPhoneCodeStatus.RequestingCode) {
      return
    }
    // handle paste
    if (number.length - rawPhoneNumber.length > 1) {
      const parsedPhoneNumber = parsePhoneNumber(number, countryCode)

      if (parsedPhoneNumber?.isValid()) {
        parsedPhoneNumber.country && setCountryCode(parsedPhoneNumber.country)
      }
    }

    setRawPhoneNumber(number)
    setError(undefined)
    setStatus(RequestPhoneCodeStatus.InputtingPhoneNumber)
  }

  const submitPhoneNumber = async (phoneCodeChannel: PhoneCodeChannelType) => {
    console.log("submitPhoneNumber called with channel:", phoneCodeChannel)
    console.log("Current status:", status)
    console.log("isInviteSignup:", isInviteSignup)
    console.log("rawPhoneNumber:", rawPhoneNumber)
    console.log("countryCode:", countryCode)

    if (
      status === RequestPhoneCodeStatus.LoadingCountryCode ||
      status === RequestPhoneCodeStatus.RequestingCode
    ) {
      console.log("submitPhoneNumber: Returning early due to status:", status)
      return
    }

    const parsedPhoneNumber = parsePhoneNumber(rawPhoneNumber, countryCode)
    console.log(
      "Parsed phone number:",
      parsedPhoneNumber?.number,
      "isValid:",
      parsedPhoneNumber?.isValid(),
    )

    phoneCodeChannel && setPhoneCodeChannel(phoneCodeChannel)
    if (parsedPhoneNumber?.isValid()) {
      if (
        !parsedPhoneNumber.country ||
        (phoneCodeChannel === PhoneCodeChannelType.Sms && !isSmsSupported) ||
        (phoneCodeChannel === PhoneCodeChannelType.Whatsapp && !isWhatsAppSupported)
      ) {
        console.log("submitPhoneNumber: Unsupported country/channel")
        console.log("Country:", parsedPhoneNumber.country)
        console.log("isSmsSupported:", isSmsSupported)
        console.log("isWhatsAppSupported:", isWhatsAppSupported)
        setStatus(RequestPhoneCodeStatus.Error)
        setError(ErrorType.UnsupportedCountryError)
        return
      }

      setValidatedPhoneNumber(parsedPhoneNumber.number)
      console.log("Set validated phone number:", parsedPhoneNumber.number)

      if (skipRequestPhoneCode) {
        console.log("Skipping request phone code (local environment)")
        setStatus(RequestPhoneCodeStatus.SuccessRequestingCode)
        return
      }

      // If this is an invite signup, use registration flow (no captcha needed)
      if (isInviteSignup) {
        console.log("=== INVITE SIGNUP FLOW - USING REGISTRATION API ===")
        console.log("About to call userPhoneRegistrationInitiate mutation")
        console.log("Phone number:", parsedPhoneNumber.number)
        console.log("Channel:", phoneCodeChannel)

        setStatus(RequestPhoneCodeStatus.RequestingCode)
        try {
          console.log("Calling userPhoneRegistrationInitiate mutation...")
          const res = await userPhoneRegistrationInitiate({
            variables: {
              input: { phone: parsedPhoneNumber.number, channel: phoneCodeChannel },
            },
          })

          console.log("Registration API response:", JSON.stringify(res.data))

          if (res.data?.userPhoneRegistrationInitiate?.errors?.length) {
            console.log(
              "Registration API returned errors:",
              res.data.userPhoneRegistrationInitiate.errors,
            )
            setStatus(RequestPhoneCodeStatus.Error)
            setError(ErrorType.RequestCodeError)
          } else {
            console.log("Registration API SUCCESS - code should be sent via Twilio")
            setStatus(RequestPhoneCodeStatus.SuccessRequestingCode)
          }
        } catch (error) {
          console.error("Error requesting registration code:", error)
          setStatus(RequestPhoneCodeStatus.Error)
          setError(ErrorType.RequestCodeError)
        }
      } else {
        // Regular login flow with captcha
        console.log("=== REGULAR LOGIN FLOW - USING CAPTCHA ===")
        setStatus(RequestPhoneCodeStatus.CompletingCaptcha)
        registerCaptcha()
      }
    } else {
      setStatus(RequestPhoneCodeStatus.Error)
      setError(ErrorType.InvalidPhoneNumberError)
    }
  }

  useEffect(() => {
    if (status !== RequestPhoneCodeStatus.CompletingCaptcha) {
      return
    }

    ;(async () => {
      if (geetestError) {
        setStatus(RequestPhoneCodeStatus.Error)
        setError(ErrorType.FailedCaptchaError)
        resetError()
        return
      }

      if (geetestValidationData && validatedPhoneNumber) {
        setStatus(RequestPhoneCodeStatus.RequestingCode)
        const input = {
          phone: validatedPhoneNumber,
          challengeCode: geetestValidationData.geetestChallenge,
          validationCode: geetestValidationData.geetestValidate,
          secCode: geetestValidationData.geetestSecCode,
          channel: phoneCodeChannel,
        } as const
        resetValidationData()
        logRequestAuthCode({
          instance: appConfig.galoyInstance.id,
          channel: phoneCodeChannel,
        })

        try {
          const { data } = await captchaRequestAuthCode({ variables: { input } })

          if (data?.captchaRequestAuthCode.success) {
            setStatus(RequestPhoneCodeStatus.SuccessRequestingCode)
            return
          }

          setStatus(RequestPhoneCodeStatus.Error)
          const errors = data?.captchaRequestAuthCode.errors

          if (errors && errors.some((error) => error.code === "TOO_MANY_REQUEST")) {
            console.log("Too many attempts")
            setError(ErrorType.TooManyAttemptsError)
          } else {
            setError(ErrorType.RequestCodeError)
          }
        } catch (err) {
          setStatus(RequestPhoneCodeStatus.Error)
          setError(ErrorType.RequestCodeError)
        }
      }
    })()
  }, [
    status,
    geetestValidationData,
    validatedPhoneNumber,
    appConfig,
    captchaRequestAuthCode,
    geetestError,
    phoneCodeChannel,
    resetError,
    resetValidationData,
  ])

  let phoneInputInfo: PhoneInputInfo | undefined = undefined
  if (countryCode) {
    phoneInputInfo = {
      countryCode,
      formattedPhoneNumber: new AsYouType(countryCode).input(rawPhoneNumber),
      countryCallingCode: getCountryCallingCode(countryCode),
      rawPhoneNumber,
    }
  }

  return {
    status,
    setStatus,
    phoneInputInfo,
    validatedPhoneNumber,
    error,
    submitPhoneNumber,
    phoneCodeChannel,
    isWhatsAppSupported,
    isSmsSupported,
    captchaLoading: loadingRegisterCaptcha,
    setCountryCode,
    setPhoneNumber,
    supportedCountries: allSupportedCountries,
    loadingSupportedCountries,
  }
}
