/* eslint-disable camelcase */
import { GaloyInstanceName } from "@app/config/galoy-instances"
import {
  PaymentSendResult,
  PhoneCodeChannelType,
  WalletCurrency,
} from "@app/graphql/generated"
import { ValidatePhoneCodeErrorsType } from "@app/screens/phone-auth-screen"
import { InvoiceType } from "@app/screens/receive-bitcoin-screen/payment/index.types"
import { ParseDestinationResult } from "@app/screens/send-bitcoin-screen/payment-destination/index.types"
import { PaymentType as ParsedPaymentType } from "@galoymoney/client"
import { getAnalytics } from "@react-native-firebase/analytics"

export const logRequestAuthCode = ({
  instance,
  channel,
}: {
  instance: GaloyInstanceName
  channel: PhoneCodeChannelType
}) => {
  getAnalytics().logEvent("request_auth_code", { instance, channel })
}

export const logCreatedDeviceAccount = () => {
  getAnalytics().logEvent("created_device_account")
}

export const logAttemptCreateDeviceAccount = () => {
  getAnalytics().logEvent("attempt_create_device_account")
}

export const logCreateDeviceAccountFailure = () => {
  getAnalytics().logEvent("create_device_account_failure")
}

export const logGetStartedAction = ({
  action,
  createDeviceAccountEnabled,
}: {
  action: "log_in" | "create_device_account" | "explore_wallet" | "login_with_email"
  createDeviceAccountEnabled: boolean
}) => {
  getAnalytics().logEvent("get_started_action", {
    action,
    create_device_account_enabled: createDeviceAccountEnabled,
  })
}

export const logValidateAuthCodeFailure = ({
  error,
}: {
  error: ValidatePhoneCodeErrorsType
}) => {
  getAnalytics().logEvent("validate_auth_code_failure", {
    error,
  })
}

export const logStartCaptcha = () => {
  getAnalytics().logEvent("start_captcha")
}

export const logUpgradeLoginAttempt = () => {
  getAnalytics().logEvent("upgrade_login_attempt")
}

export const logAddPhoneAttempt = () => {
  getAnalytics().logEvent("add_phone_attempt")
}

export const logUpgradeLoginSuccess = () => {
  getAnalytics().logEvent("upgrade_login_success")
}

export const logParseDestinationResult = (parsedDestination: ParseDestinationResult) => {
  if (parsedDestination.valid) {
    getAnalytics().logEvent("payment_destination_accepted", {
      paymentType: parsedDestination.validDestination.paymentType,
      direction: parsedDestination.destinationDirection,
    })
  } else {
    getAnalytics().logEvent("payment_destination_rejected", {
      reason: parsedDestination.invalidReason,
      paymentType: parsedDestination.invalidPaymentDestination.paymentType,
    })
  }
}

type LogPaymentAttemptParams = {
  paymentType: ParsedPaymentType
  sendingWallet: WalletCurrency
}

export const logPaymentAttempt = (params: LogPaymentAttemptParams) => {
  getAnalytics().logEvent("payment_attempt", {
    payment_type: params.paymentType,
    sending_wallet: params.sendingWallet,
  })
}

type LogPaymentResultParams = {
  paymentType: ParsedPaymentType
  sendingWallet: WalletCurrency
  paymentStatus: PaymentSendResult | null | undefined
}

export const logPaymentResult = (params: LogPaymentResultParams) => {
  getAnalytics().logEvent("payment_result", {
    payment_type: params.paymentType,
    sending_wallet: params.sendingWallet,
    payment_status: params.paymentStatus,
  })
}

type LogConversionAttemptParams = {
  sendingWallet: WalletCurrency
  receivingWallet: WalletCurrency
}

export const logConversionAttempt = (params: LogConversionAttemptParams) => {
  getAnalytics().logEvent("conversion_attempt", {
    sending_wallet: params.sendingWallet,
    receiving_wallet: params.receivingWallet,
  })
}

type LogConversionResultParams = {
  sendingWallet: WalletCurrency
  receivingWallet: WalletCurrency
  paymentStatus: PaymentSendResult
}
export const logConversionResult = (params: LogConversionResultParams) => {
  getAnalytics().logEvent("conversion_result", {
    sending_wallet: params.sendingWallet,
    receiving_wallet: params.receivingWallet,
    payment_status: params.paymentStatus,
  })
}

type LogGeneratePaymentRequestParams = {
  paymentType: InvoiceType
  hasAmount: boolean
  receivingWallet: WalletCurrency
}

export const logGeneratePaymentRequest = (params: LogGeneratePaymentRequestParams) => {
  getAnalytics().logEvent("generate_payment_request", {
    payment_type: params.paymentType.toLowerCase(),
    has_amount: params.hasAmount,
    receiving_wallet: params.receivingWallet,
  })
}

export const logEnterForeground = () => {
  getAnalytics().logEvent("enter_foreground")
}

export const logEnterBackground = () => {
  getAnalytics().logEvent("enter_background")
}

export const logLogout = () => {
  getAnalytics().logEvent("logout")
}

type LogToastShownParams = {
  message: string
  type: "error" | "success" | "warning"
  isTranslated: boolean
}

export const logToastShown = (params: LogToastShownParams) => {
  getAnalytics().logEvent("toast_shown", {
    message: params.message,
    type: params.type,
    is_translated: params.isTranslated,
  })
}

type LogAppFeedbackParams = {
  isEnjoingApp: boolean
}

export const logAppFeedback = (params: LogAppFeedbackParams) => {
  getAnalytics().logEvent("app_feedback", {
    is_enjoying_app: params.isEnjoingApp,
  })
}
