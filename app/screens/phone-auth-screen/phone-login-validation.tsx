import React, { useCallback, useEffect, useState } from "react"
import { ActivityIndicator, View } from "react-native"
import { getAnalytics } from "@react-native-firebase/analytics"
import { getCrashlytics } from "@react-native-firebase/crashlytics"
import { StackScreenProps } from "@react-navigation/stack"
import { Text, makeStyles, useTheme, Input } from "@rneui/themed"
import { hexToBytes } from "@noble/curves/abstract/utils"
import * as Keychain from "react-native-keychain"
import { gql } from "@apollo/client"
import { nip19 } from "nostr-tools"

// components
import { Screen } from "../../components/screen"
import { GaloyInfo } from "@app/components/atomic/galoy-info"
import { GaloyErrorBox } from "@app/components/atomic/galoy-error-box"
import { GaloySecondaryButton } from "@app/components/atomic/galoy-secondary-button"

// gql
import {
  PhoneCodeChannelType,
  useUserLoginMutation,
  useUserLoginUpgradeMutation,
} from "@app/graphql/generated"
import { AccountLevel, useLevel } from "@app/graphql/level-context"

// hooks
import { usePersistentStateContext } from "@app/store/persistent-state"
import { useI18nContext } from "@app/i18n/i18n-react"
import { useAppConfig } from "../../hooks"

// types
import { TranslationFunctions } from "@app/i18n/i18n-types"
import { PhoneCodeChannelToFriendlyName } from "./request-phone-code-login"
import type { PhoneValidationStackParamList } from "../../navigation/stack-param-lists"

// utils
import {
  logUpgradeLoginAttempt,
  logUpgradeLoginSuccess,
  logValidateAuthCodeFailure,
} from "@app/utils/analytics"
import { parseTimer } from "../../utils/timer"
import { KEYCHAIN_MNEMONIC_KEY } from "@app/utils/breez-sdk-liquid"
import { KEYCHAIN_NOSTRCREDS_KEY } from "@app/components/import-nsec/utils"

gql`
  mutation userLogin($input: UserLoginInput!) {
    userLogin(input: $input) {
      errors {
        message
        code
      }
      authToken
      totpRequired
    }
  }

  mutation userLoginUpgrade($input: UserLoginUpgradeInput!) {
    userLoginUpgrade(input: $input) {
      errors {
        message
        code
      }
      success
      authToken
    }
  }
`

type Props = StackScreenProps<PhoneValidationStackParamList, "phoneLoginValidate">

const ValidatePhoneCodeStatus = {
  WaitingForCode: "WaitingForCode",
  LoadingAuthResult: "LoadingAuthResult",
  ReadyToRegenerate: "ReadyToRegenerate",
}

type ValidatePhoneCodeStatusType =
  (typeof ValidatePhoneCodeStatus)[keyof typeof ValidatePhoneCodeStatus]

const ValidatePhoneCodeErrors = {
  InvalidCode: "InvalidCode",
  TooManyAttempts: "TooManyAttempts",
  CannotUpgradeToExistingAccount: "CannotUpgradeToExistingAccount",
  UnknownError: "UnknownError",
} as const

const mapGqlErrorsToValidatePhoneCodeErrors = (
  errors: readonly { code?: string | null | undefined }[],
): ValidatePhoneCodeErrorsType | undefined => {
  if (errors.some((error) => error.code === "PHONE_CODE_ERROR")) {
    return ValidatePhoneCodeErrors.InvalidCode
  }

  if (errors.some((error) => error.code === "TOO_MANY_REQUEST")) {
    return ValidatePhoneCodeErrors.TooManyAttempts
  }

  if (
    errors.some(
      (error) =>
        error.code === "PHONE_ACCOUNT_ALREADY_EXISTS_ERROR" ||
        error.code === "PHONE_ACCOUNT_ALREADY_EXISTS_NEED_TO_SWEEP_FUNDS_ERROR",
    )
  ) {
    return ValidatePhoneCodeErrors.CannotUpgradeToExistingAccount
  }

  if (errors.length > 0) {
    return ValidatePhoneCodeErrors.UnknownError
  }

  return undefined
}

const mapValidatePhoneCodeErrorsToMessage = (
  error: ValidatePhoneCodeErrorsType,
  LL: TranslationFunctions,
): string => {
  switch (error) {
    case ValidatePhoneCodeErrors.InvalidCode:
      return LL.PhoneLoginValidationScreen.errorLoggingIn()
    case ValidatePhoneCodeErrors.TooManyAttempts:
      return LL.PhoneLoginValidationScreen.errorTooManyAttempts()
    case ValidatePhoneCodeErrors.CannotUpgradeToExistingAccount:
      return LL.PhoneLoginValidationScreen.errorCannotUpgradeToExistingAccount()
    case ValidatePhoneCodeErrors.UnknownError:
    default:
      return LL.errors.generic()
  }
}

export type ValidatePhoneCodeErrorsType =
  (typeof ValidatePhoneCodeErrors)[keyof typeof ValidatePhoneCodeErrors]

export const PhoneLoginValidationScreen: React.FC<Props> = ({ navigation, route }) => {
  const styles = useStyles()
  const { colors } = useTheme().theme
  const { LL } = useI18nContext()
  const { currentLevel } = useLevel()
  const { saveToken } = useAppConfig()
  const { updateState } = usePersistentStateContext()

  const [code, _setCode] = useState("")
  const [secondsRemaining, setSecondsRemaining] = useState<number>(30)
  const [error, setError] = useState<ValidatePhoneCodeErrorsType | undefined>()
  const [status, setStatus] = useState<ValidatePhoneCodeStatusType>(
    ValidatePhoneCodeStatus.WaitingForCode,
  )

  const [userLoginMutation] = useUserLoginMutation({
    fetchPolicy: "no-cache",
  })
  const [userLoginUpgradeMutation] = useUserLoginUpgradeMutation({
    fetchPolicy: "no-cache",
  })

  const isUpgradeFlow = currentLevel === AccountLevel.Zero

  const { phone, channel, mnemonicKey, nsec } = route.params

  const send = useCallback(
    async (code: string) => {
      if (status === ValidatePhoneCodeStatus.LoadingAuthResult) {
        return
      }

      try {
        let errors: readonly { code?: string | null | undefined }[] | undefined

        setStatus(ValidatePhoneCodeStatus.LoadingAuthResult)
        if (isUpgradeFlow) {
          logUpgradeLoginAttempt()
          const { data } = await userLoginUpgradeMutation({
            variables: { input: { phone, code } },
          })

          const success = data?.userLoginUpgrade?.success
          const authToken = data?.userLoginUpgrade?.authToken
          if (success) {
            logUpgradeLoginSuccess()

            if (authToken) {
              saveToken(authToken)
            }

            navigation.replace("Primary")
            return
          }

          errors = data?.userLoginUpgrade?.errors
        } else {
          const { data } = await userLoginMutation({
            variables: { input: { phone, code } },
          })

          const authToken = data?.userLogin?.authToken
          const totpRequired = data?.userLogin?.totpRequired

          if (authToken) {
            if (totpRequired) {
              navigation.navigate("totpLoginValidate", {
                authToken,
              })
              return
            }
            getAnalytics().logLogin({ method: "phone" })
            saveToken(authToken)

            // enable breez btc wallet
            if (mnemonicKey) {
              await Keychain.setInternetCredentials(
                KEYCHAIN_MNEMONIC_KEY,
                KEYCHAIN_MNEMONIC_KEY,
                mnemonicKey,
              )
              updateState((state: any) => {
                if (state)
                  return {
                    ...state,
                    isAdvanceMode: true,
                  }
                return undefined
              })
            }
            // enbale nostr chat
            if (nsec) {
              const secretKey = hexToBytes(nsec)
              await Keychain.setInternetCredentials(
                KEYCHAIN_NOSTRCREDS_KEY,
                KEYCHAIN_NOSTRCREDS_KEY,
                nip19.nsecEncode(secretKey),
              )
            }

            navigation.reset({
              index: 0,
              routes: [{ name: "authenticationCheck" }],
            })
            return
          }

          errors = data?.userLogin?.errors
        }

        const error =
          mapGqlErrorsToValidatePhoneCodeErrors(errors || []) ||
          ValidatePhoneCodeErrors.UnknownError

        logValidateAuthCodeFailure({
          error,
        })
        setError(error)
        _setCode("")
        setStatus(ValidatePhoneCodeStatus.ReadyToRegenerate)
      } catch (err) {
        if (err instanceof Error) {
          getCrashlytics().recordError(err)
          console.debug({ err })
        }
        setError(ValidatePhoneCodeErrors.UnknownError)
        _setCode("")
        setStatus(ValidatePhoneCodeStatus.ReadyToRegenerate)
      }
    },
    [
      status,
      userLoginMutation,
      userLoginUpgradeMutation,
      phone,
      saveToken,
      _setCode,
      navigation,
      isUpgradeFlow,
    ],
  )

  const setCode = (code: string) => {
    if (code.length > 6) {
      return
    }

    setError(undefined)
    _setCode(code)
    if (code.length === 6) {
      send(code)
    }
  }

  useEffect(() => {
    const timerId = setTimeout(() => {
      if (secondsRemaining > 0) {
        setSecondsRemaining(secondsRemaining - 1)
      } else if (status === ValidatePhoneCodeStatus.WaitingForCode) {
        setStatus(ValidatePhoneCodeStatus.ReadyToRegenerate)
      }
    }, 1000)
    return () => clearTimeout(timerId)
  }, [secondsRemaining, status])

  const errorMessage = error && mapValidatePhoneCodeErrorsToMessage(error, LL)
  let extraInfoContent = undefined
  switch (status) {
    case ValidatePhoneCodeStatus.ReadyToRegenerate:
      extraInfoContent = (
        <>
          {errorMessage && (
            <View style={styles.marginBottom}>
              <GaloyErrorBox errorMessage={errorMessage} />
            </View>
          )}
          {error === ValidatePhoneCodeErrors.CannotUpgradeToExistingAccount ? null : (
            <View style={styles.marginBottom}>
              <GaloyInfo>
                {LL.PhoneLoginValidationScreen.sendViaOtherChannel({
                  channel: PhoneCodeChannelToFriendlyName[channel],
                  other:
                    PhoneCodeChannelToFriendlyName[
                      channel === PhoneCodeChannelType.Sms
                        ? PhoneCodeChannelType.Whatsapp
                        : PhoneCodeChannelType.Sms
                    ],
                })}
              </GaloyInfo>
            </View>
          )}
          <GaloySecondaryButton
            title={LL.PhoneLoginValidationScreen.sendAgain()}
            onPress={() => navigation.goBack()}
          />
        </>
      )
      break
    case ValidatePhoneCodeStatus.LoadingAuthResult:
      extraInfoContent = (
        <ActivityIndicator
          style={styles.activityIndicator}
          size="large"
          color={colors.primary}
        />
      )
      break
    case ValidatePhoneCodeStatus.WaitingForCode:
      extraInfoContent = (
        <View style={styles.timerRow}>
          <Text type="p3" color={colors.grey3}>
            {LL.PhoneLoginValidationScreen.sendAgain()} {parseTimer(secondsRemaining)}
          </Text>
        </View>
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
      <Text type="p1" style={styles.header}>
        {LL.PhoneLoginValidationScreen.header({
          channel: PhoneCodeChannelToFriendlyName[channel],
          phoneNumber: phone,
        })}
      </Text>
      <Input
        placeholder="000000"
        containerStyle={styles.inputComponentContainerStyle}
        inputContainerStyle={styles.inputContainerStyle}
        inputStyle={styles.inputStyle}
        value={code}
        onChangeText={setCode}
        renderErrorMessage={false}
        autoFocus={true}
        textContentType={"oneTimeCode"}
        keyboardType="numeric"
      />
      <View style={styles.extraInfoContainer}>{extraInfoContent}</View>
    </Screen>
  )
}

const useStyles = makeStyles(({ colors }) => ({
  screenStyle: {
    padding: 20,
    flexGrow: 1,
  },
  activityIndicator: {
    marginTop: 12,
  },
  extraInfoContainer: {
    marginBottom: 20,
    flex: 1,
  },
  header: {
    marginBottom: 20,
  },
  timerRow: {
    flexDirection: "row",
    justifyContent: "center",
    textAlign: "center",
  },
  marginBottom: {
    marginBottom: 10,
  },
  inputComponentContainerStyle: {
    flexDirection: "row",
    marginBottom: 20,
    paddingLeft: 0,
    paddingRight: 0,
    justifyContent: "center",
  },
  inputContainerStyle: {
    minWidth: 160,
    minHeight: 60,
    borderWidth: 1,
    paddingHorizontal: 10,
    borderColor: colors.border02,
    borderRadius: 10,
  },
  inputStyle: {
    fontSize: 24,
    textAlign: "center",
  },
}))
