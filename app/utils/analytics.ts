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

type LogPaymentBlockedExpiredInvoiceParams = {
  paymentType: ParsedPaymentType
  sendingWallet: WalletCurrency
}

/**
 * The send flow refused to transmit an invoice it could see had already
 * expired (ENG-555). Distinct from `payment_attempt`, which is not logged in
 * that case because nothing is attempted — without this event a blocked send
 * leaves no client trace and, since no request goes out, no server trace
 * either, which is exactly the diagnosis dead-end the guard exists to end.
 */
export const logPaymentBlockedExpiredInvoice = (
  params: LogPaymentBlockedExpiredInvoiceParams,
) => {
  getAnalytics().logEvent("payment_blocked_expired_invoice", {
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

// ============================================
// Featured profile events
// ============================================

type LogFeaturedProfileSelectedParams = {
  discoveryMethod: "search" | "long_press" | "profile"
}

export const logFeaturedProfileSelected = (params: LogFeaturedProfileSelectedParams) => {
  getAnalytics().logEvent("featured_profile_selected", {
    discovery_method: params.discoveryMethod,
  })
}

type LogFeaturedViewOpenedParams = {
  entryPoint: "search" | "long_press" | "profile"
  isFirstAccess: boolean
}

export const logFeaturedViewOpened = (params: LogFeaturedViewOpenedParams) => {
  getAnalytics().logEvent("featured_view_opened", {
    entry_point: params.entryPoint,
    is_first_access: params.isFirstAccess,
  })
}

// A Plaid Link failure that happens inside the Plaid webview (rate limit, IP
// block, institution error, ...) — never reaches the backend, so this is the
// only place it can be recorded. The error_code dimension lets us confirm the
// cause (e.g. IP-based rate limiting) across affected users.
export const logPlaidLinkFailure = ({ errorCode }: { errorCode: string }) => {
  getAnalytics().logEvent("plaid_link_failure", {
    error_code: errorCode,
  })
}

// ============================================
// Flash assistant (ENG-687, docs/ai-assistant-tool-registry.md §8)
// ============================================
// The assistant's engine reports through these (app/assistant/engine/
// telemetry.ts). Their parameter types are declared here, not imported from
// app/assistant/: the assistant depends on the rest of the app, never the
// other way round (spec §2). Every parameter is a closed union, a number or
// a boolean, except `intent`, which the engine narrows to its closed intent
// set; none can carry a memo, a payee or an amount, so no payload text
// reaches Firebase.

/**
 * How an assistant tool call or Confirm ended. telemetry.ts says which path
 * reports which, as AssistantOutcome.
 */
export type AssistantEventOutcome =
  | "answered"
  | "clarification"
  | "prepared"
  | "error"
  | "rejected"
  | "confirmed"
  | "failed"
  | "unknown"
  | "denied"
  | "refreshed"
  | "expired"

/**
 * Why the assistant's on-device model tier refused a call the model answered
 * with (ENG-751): the router's pre-check, the grounding check, or one of
 * its guards: a send to one payee for an ask about more than one person
 * (groupSend), a history read for an ask that names a date (timeFilter), or
 * one whose search the person never asked for (ungroundedFilter).
 */
export type AssistantModelRefusal =
  | "precheck"
  | "ungrounded"
  | "groupSend"
  | "timeFilter"
  | "ungroundedFilter"

/** The parameters of one `assistant_event`. */
export type AssistantEventParams = {
  /**
   * The intent's name, or "unknown" when the router could not read one. The
   * engine's AssistantToolEvent narrows it to the closed intent set.
   */
  intent: string
  /** "none" when the router could not read an intent from the call. */
  tier: "read" | "action" | "none"
  outcome: AssistantEventOutcome
  latencyMs: number
  /**
   * Whether an on-device model served the call (ENG-690): true for a call
   * the model emitted, whether it ran or was refused (by the router's
   * pre-check, the grounding check or a guard, ENG-751), and for a pick, a
   * Try again or a Refresh of a card it prepared, which issue its call
   * again; false for the grammar's calls and their cards', for an utterance
   * no model answered with a call, and for every Confirm, a model-prepared
   * card's included (ENG-690 decision 8, deferred). Not
   * AssistantCoverageParams.onDeviceModelAvailable, which says whether the
   * device could run a model at all.
   */
  onDeviceModelAvailable: boolean
  /**
   * Why the model tier refused the call the model answered with (ENG-751),
   * on that utterance's rejected event; absent on every other event.
   */
  onDeviceModelReason?: AssistantModelRefusal
}

/**
 * One tool call or one Confirm: its intent, tier, outcome and latency, and
 * why the model tier refused the model's call when it did.
 */
export const logAssistantEvent = (params: AssistantEventParams) => {
  getAnalytics().logEvent("assistant_event", {
    intent: params.intent,
    tier: params.tier,
    outcome: params.outcome,
    latency_ms: Math.round(params.latencyMs),
    on_device_model_available: params.onDeviceModelAvailable,
    ...(params.onDeviceModelReason === undefined
      ? {}
      : { on_device_model_reason: params.onDeviceModelReason }),
  })
}

/** An assistant thread was opened. Weekly active assistant users count these. */
export const logAssistantThreadOpened = () => {
  getAnalytics().logEvent("assistant_thread_opened")
}

/** A thread was left while a clarification was still unanswered. */
export const logAssistantClarificationAbandoned = ({
  clarificationCount,
}: {
  clarificationCount: number
}) => {
  getAnalytics().logEvent("assistant_clarification_abandoned", {
    clarification_count: clarificationCount,
  })
}

type LogSendOpenToConfirmParams = {
  /**
   * `assistant`: from opening a thread to the first confirmed send in it.
   * `classic`: from opening the send flow's destination screen to a confirmed
   * send, the same measure for the screens, for comparison (spec §8).
   */
  flow: "assistant" | "classic"
  openToConfirmMs: number
}

export const logSendOpenToConfirm = (params: LogSendOpenToConfirmParams) => {
  getAnalytics().logEvent("send_open_to_confirm", {
    flow: params.flow,
    open_to_confirm_ms: Math.round(params.openToConfirmMs),
  })
}

/**
 * Whether this device could run an on-device model, reported once per
 * install, whatever the assistant's flag (ENG-689, decision 4): it sizes
 * Phase 3's addressable base (docs/ai-assistant-tool-registry.md §7.1).
 * Device capability only, nothing that identifies the user or the device.
 */
export type AssistantCoverageParams = {
  onDeviceModelAvailable: boolean
  platform: "ios" | "android" | "other"
  /** The OS's major version, when it reads as one. */
  osMajorVersion: number | null
  /**
   * The model's generation, never its full identifier: "iPhone17" on iOS;
   * "android" or "other" elsewhere.
   */
  deviceClass: string
}

export const logAssistantCoverage = (params: AssistantCoverageParams) => {
  getAnalytics().logEvent("assistant_coverage", {
    on_device_model_available: params.onDeviceModelAvailable,
    platform: params.platform,
    ...(params.osMajorVersion === null
      ? {}
      : { os_major_version: params.osMajorVersion }),
    device_class: params.deviceClass,
  })
}
