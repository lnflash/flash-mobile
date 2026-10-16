import * as bip39 from "bip39"
import RNFS from "react-native-fs"
import { PaymentType } from "@galoymoney/client"
import * as Keychain from "react-native-keychain"
import {
  AssetFilter,
  PaymentRequest,
  PaymentStatus,
  defaultConfig,
  Network,
  ReceivePaymentMethod,
  Seed,
  SdkBuilder,
  SendPaymentOptions,
  InputType_Tags,
  OnchainConfirmationSpeed,
  MaxFee,
  Fee,
  initLogging,
} from "@breeztech/breez-sdk-spark-react-native"
import type {
  BreezSdkInterface,
  SdkEvent,
  InputType,
  ReceivePaymentResponse,
  SendPaymentResponse,
  ClaimDepositRequest,
  DepositInfo,
  RefundDepositResponse,
  RecommendedFees,
  LnurlPayResponse,
  LightningAddressInfo,
  Payment,
  Logger,
  LogEntry,
  LnurlPayRequestDetails,
} from "@breeztech/breez-sdk-spark-react-native"
import { API_KEY, BREEZ_LNURL_DOMAIN } from "@env"
import { getCrashlytics } from "@react-native-firebase/crashlytics"
import { appendLog, initLogBuffer } from "./log-buffer"
import {
  BreezFeeError,
  classifyBreezSdkError,
  lnurlLimitsFromPayRequest,
  validateAmountWithinLimits,
} from "./fee-errors"
import { extractFeeFromPaymentMethod } from "./fee-extraction"
import { BreezSdkNotInitializedError, BreezSdkNotRunningReason } from "./sdk-errors"
import { LnurlPayOutcomeUnknownError } from "./lnurl-pay-errors"

// Constants
export const KEYCHAIN_MNEMONIC_KEY = "mnemonic_key"
const STORAGE_DIR = "breez-spark-data"

// SDK Instance Management
export let breezSDKInitialized = false
let breezSDKInitializing: Promise<boolean> | null = null
let sdkInstance: BreezSdkInterface | null = null
// Whether the last initializeBreezSDK() gave up. Cleared by a start that
// succeeds and by disconnectToSDK.
let breezSDKInitFailed = false
// Whether the user has switched the BTC wallet off: advance mode is off
// (BreezContext.tsx). Turning advance mode off stops nothing, so the SDK can
// still be running, or a start still retrying, and this flag, not the
// instance, is what says the wallet is off (ENG-687).
let breezSDKSwitchedOff = false

const notRunningReason = (): BreezSdkNotRunningReason => {
  // Off by the user's choice comes first: a start still connecting, or one
  // that gave up, does not explain a wallet the user switched off.
  if (breezSDKSwitchedOff) return "off"
  if (breezSDKInitializing) return "starting"
  return breezSDKInitFailed ? "failed" : "off"
}

/**
 * Get the initialized SDK instance
 * @throws BreezSdkNotInitializedError if SDK is not initialized, with the
 * reason: `off` while the wallet is switched off, else `starting` while
 * initializeBreezSDK() is still connecting, `failed` after it gave up, `off`
 * otherwise
 */
export const getSDKInstance = (): BreezSdkInterface => {
  if (!sdkInstance) {
    throw new BreezSdkNotInitializedError({ reason: notRunningReason() })
  }
  return sdkInstance
}

/**
 * Advance mode was turned off: the user switched the BTC wallet off. Nothing
 * is stopped, but from now on the BTC rail's reads find the wallet off
 * (assertBreezSDKSwitchedOn) even while an SDK instance still runs, and a
 * start that gives up after this reads as off, not failed (ENG-687).
 * BreezContext calls markBreezSDKSwitchedOn before it starts the SDK again.
 */
export const markBreezSDKSwitchedOff = (): void => {
  breezSDKSwitchedOff = true
}

/** Advance mode is on: the BTC wallet is switched on again (ENG-687). */
export const markBreezSDKSwitchedOn = (): void => {
  breezSDKSwitchedOff = false
}

/**
 * For the BTC rail's reads of the wallet's balance and payments
 * (app/payments/btc-rail.ts): throws BreezSdkNotInitializedError, reason
 * `off`, while the wallet is switched off, whether or not an SDK instance is
 * running. The screens hide the BTC wallet then, and the rail shows nothing
 * of it either (ENG-687).
 */
export const assertBreezSDKSwitchedOn = (): void => {
  if (breezSDKSwitchedOff) throw new BreezSdkNotInitializedError({ reason: "off" })
}

export const lnurlPayRequestDetailsFromInput = (
  input: InputType,
): LnurlPayRequestDetails | null => {
  if (input.tag === "LightningAddress") {
    return input.inner[0].payRequest
  }

  if (input.tag === "LnurlPay") {
    return input.inner[0]
  }

  return null
}

// SDK Initialization
export const initializeBreezSDK = async (): Promise<boolean> => {
  if (breezSDKInitialized) {
    return false
  }

  if (breezSDKInitializing !== null) {
    return breezSDKInitializing
  }

  breezSDKInitializing = (async () => {
    try {
      await retry(() => connectToSDK(), 5000, 3)
      breezSDKInitialized = true
      breezSDKInitFailed = false
      return true
    } catch (error: unknown) {
      breezSDKInitFailed = true
      const message = error instanceof Error ? error.message : String(error)
      console.error("Failed to connect to Breez SDK after retries:", message)
      throw new Error(`Failed to connect to Breez SDK: ${message}`)
    } finally {
      breezSDKInitializing = null
    }
  })()

  return breezSDKInitializing
}

const retry = <T>(fn: () => Promise<T>, delayMs = 5000, maxRetries = 3): Promise<T> =>
  new Promise((resolve, reject) => {
    let attempts = 0
    const tryFn = async () => {
      try {
        resolve(await fn())
      } catch (err) {
        if (++attempts >= maxRetries) {
          reject(err)
        } else {
          setTimeout(tryFn, delayMs)
        }
      }
    }
    tryFn()
  })

const breezLogger: Logger = {
  log(l: LogEntry) {
    appendLog(l.level, l.line)
  },
}

let loggingInitialized = false

const connectToSDK = async (): Promise<void> => {
  if (!loggingInitialized && !__DEV__) {
    await initLogBuffer()
    initLogging(undefined, breezLogger, undefined)
    loggingInitialized = true
  }

  const mnemonic = await getMnemonic()

  const seed = new Seed.Mnemonic({ mnemonic, passphrase: undefined })

  const config = defaultConfig(Network.Mainnet)
  config.apiKey = API_KEY
  config.lnurlDomain = BREEZ_LNURL_DOMAIN
  config.maxDepositClaimFee = new MaxFee.NetworkRecommended({
    leewaySatPerVbyte: BigInt(1),
  })

  const storageDir = `${RNFS.DocumentDirectoryPath}/${STORAGE_DIR}`
  const builder = new SdkBuilder(config, seed)
  await builder.withDefaultStorage(storageDir)

  sdkInstance = await builder.build()
}

export const disconnectToSDK = async (): Promise<void> => {
  try {
    if (sdkInstance && breezSDKInitialized) {
      await sdkInstance.disconnect()
      sdkInstance = null
    }

    await Keychain.resetInternetCredentials({ server: KEYCHAIN_MNEMONIC_KEY })

    const storageDir = `${RNFS.DocumentDirectoryPath}/${STORAGE_DIR}`
    if (await RNFS.exists(storageDir)) {
      await RNFS.unlink(storageDir)
    }

    breezSDKInitialized = false
    breezSDKInitializing = null
    breezSDKInitFailed = false
  } catch (error) {
    console.error("Disconnect error:", error)
    throw error
  }
}

// Mnemonic Management
const getMnemonic = async (): Promise<string> => {
  const credentials = await Keychain.getInternetCredentials(KEYCHAIN_MNEMONIC_KEY)
  if (credentials) {
    return credentials.password
  }

  const mnemonic = bip39.generateMnemonic(128)
  await Keychain.setInternetCredentials(
    KEYCHAIN_MNEMONIC_KEY,
    KEYCHAIN_MNEMONIC_KEY,
    mnemonic,
  )
  return mnemonic
}

// Wallet Info
export const getInfo = async () => {
  const sdk = getSDKInstance()
  const info = await sdk.getInfo({ ensureSynced: true })

  return info
}

// Fee Estimation
export const fetchRecommendedFees = async (): Promise<RecommendedFees> => {
  const sdk = getSDKInstance()

  try {
    const response = await sdk.recommendedFees()

    return response
  } catch (error) {
    console.error("Failed to fetch recommended fees:", error)
    return {
      fastestFee: BigInt(10),
      halfHourFee: BigInt(5),
      hourFee: BigInt(3),
      economyFee: BigInt(1),
      minimumFee: BigInt(1),
    }
  }
}

// Fee extraction lives in ./fee-extraction (SDK-import-free) so it is
// unit-testable under plain jest.

export type FetchBreezFeeArgs = {
  paymentType: PaymentType
  paymentRequest: string
  amountSats: number
  selectedFeeType?: "fast" | "medium" | "slow"
  // A payRequest already resolved via fetchLnurlPayRequest — skips the second
  // network round-trip to the receiver's LNURL service.
  knownPayRequest?: LnurlPayRequestDetails
}

export const fetchBreezFee = async ({
  paymentType,
  paymentRequest,
  amountSats,
  selectedFeeType,
  knownPayRequest,
}: FetchBreezFeeArgs): Promise<{ fee: number | null; err: BreezFeeError | null }> => {
  try {
    const sdk = getSDKInstance()

    if (paymentType === "lightning") {
      const prepareResponse = await sdk.prepareSendPayment({
        // 0.22.x: paymentRequest is a tagged union; Input wraps the raw string
        // (bolt11 / address / BIP-21) exactly as the SDK parsed it before.
        paymentRequest: new PaymentRequest.Input({ input: paymentRequest }),
        amount: BigInt(amountSats),
        tokenIdentifier: undefined,
        conversionOptions: undefined,
        feePolicy: undefined,
      })
      const fee = extractFeeFromPaymentMethod(prepareResponse.paymentMethod)
      return { fee: Number(fee), err: null }
    }

    if (paymentType === "onchain") {
      const prepareResponse = await sdk.prepareSendPayment({
        // 0.22.x: paymentRequest is a tagged union; Input wraps the raw string
        // (bolt11 / address / BIP-21) exactly as the SDK parsed it before.
        paymentRequest: new PaymentRequest.Input({ input: paymentRequest }),
        amount: BigInt(amountSats),
        tokenIdentifier: undefined,
        conversionOptions: undefined,
        feePolicy: undefined,
      })
      const fee = extractFeeFromPaymentMethod(
        prepareResponse.paymentMethod,
        selectedFeeType,
      )
      return { fee: Number(fee), err: null }
    }

    if (paymentType === "intraledger" || paymentType === "lnurl") {
      const payRequest =
        knownPayRequest ?? lnurlPayRequestDetailsFromInput(await parse(paymentRequest))

      if (payRequest) {
        // Validate against the receiver's advertised LUD-06 bounds before
        // preparing — the SDK rejects out-of-range amounts with an opaque
        // error, while this yields the actual limit for the UI to display.
        const boundsErr = validateAmountWithinLimits(
          amountSats,
          lnurlLimitsFromPayRequest(payRequest),
        )
        if (boundsErr) {
          return { fee: null, err: boundsErr }
        }

        const prepareResponse = await sdk.prepareLnurlPay({
          amount: BigInt(amountSats),
          payRequest,
          comment: undefined,
          validateSuccessActionUrl: undefined,
          tokenIdentifier: undefined,
          conversionOptions: undefined,
          feePolicy: undefined,
        })

        return { fee: Number(prepareResponse.feeSats), err: null }
      }

      return {
        fee: null,
        err: {
          kind: "unsupported",
          message: `Wrong payment type ${paymentType}: ${paymentRequest}`,
        },
      }
    }

    return {
      fee: null,
      err: {
        kind: "unsupported",
        message: `Wrong payment type ${paymentType}: ${paymentRequest}`,
      },
    }
  } catch (err) {
    console.log("FETCH BREEZ FEE ERROR", err)
    try {
      getCrashlytics().recordError(err instanceof Error ? err : new Error(String(err)))
    } catch {
      // crashlytics unavailable — never let reporting mask the fee error
    }
    return { fee: null, err: classifyBreezSdkError(err) }
  }
}

/**
 * Resolve the receiver's LNURL-pay request for a lightning address or LNURL
 * string, so send screens can validate the amount as the user types and reuse
 * the result at fee-fetch time. Returns null on any failure — callers fall
 * back to resolution inside fetchBreezFee.
 */
export const fetchLnurlPayRequest = async (
  destination: string,
): Promise<LnurlPayRequestDetails | null> => {
  try {
    const parsed = await parse(destination)
    return lnurlPayRequestDetailsFromInput(parsed)
  } catch (err) {
    console.log("FETCH LNURL PAY REQUEST ERROR", err)
    return null
  }
}

// Receive Payments
export const receivePaymentBreez = async (
  amountSats?: number,
  description?: string,
): Promise<ReceivePaymentResponse> => {
  const sdk = getSDKInstance()

  const response = await sdk.receivePayment({
    paymentMethod: new ReceivePaymentMethod.Bolt11Invoice({
      description: description || "",
      amountSats: BigInt(amountSats || 0),
      expirySecs: undefined,
      paymentHash: undefined,
    }),
  })

  return response
}

export const receiveOnchainBreez = async (): Promise<ReceivePaymentResponse> => {
  const sdk = getSDKInstance()

  const response = await sdk.receivePayment({
    paymentMethod: new ReceivePaymentMethod.BitcoinAddress({ newAddress: undefined }),
  })

  return response
}

// Send Payments

type PayResponse = {
  success: boolean
  error?: string
  payment?: SendPaymentResponse
}

/**
 * ENG-712: which statuses of a payment sdk.sendPayment resolved with mean a
 * bolt11 send went out, keyed by the SDK's `PaymentStatus`. The Record is
 * exhaustive over that enum, so an SDK bump that adds a status fails tsc here
 * until someone decides what it means. send-payment.ts keeps its own table,
 * BREEZ_PAYMENT_SENT, because it does not import the SDK.
 */
const LIGHTNING_PAYMENT_SENT: Record<PaymentStatus, boolean> = {
  [PaymentStatus.Completed]: true,
  // Still in flight when the wait ends. It may yet complete, so it is not a
  // failure the caller may retry.
  [PaymentStatus.Pending]: true,
  [PaymentStatus.Failed]: false,
}

/**
 * payLightningBreez's answer for a send that sdk.sendPayment resolved
 * (ENG-712). With a completion timeout the SDK waits for the payment to
 * leave Pending, so a payment that fails inside the wait resolves with status
 * Failed: a resolved send is not a sent payment. A Failed payment is
 * `success: false`. It carries no reason, so there is no `error`, and each
 * caller shows its own copy: a chat zap its "Payment could not be sent.",
 * useSwap and the confirmation screen their generic error. The payment rides
 * along either way.
 */
export const lightningPayResponse = (response: SendPaymentResponse): PayResponse => ({
  success: LIGHTNING_PAYMENT_SENT[response.payment.status] === true,
  payment: response,
})

export const payLightningBreez = async (
  paymentRequest: string,
  amountSats?: number,
): Promise<PayResponse> => {
  try {
    const sdk = getSDKInstance()

    const prepareResponse = await sdk.prepareSendPayment({
      // 0.22.x: paymentRequest is a tagged union; Input wraps the raw string
      // (bolt11 / address / BIP-21) exactly as the SDK parsed it before.
      paymentRequest: new PaymentRequest.Input({ input: paymentRequest }),
      amount: amountSats !== undefined ? BigInt(amountSats) : undefined,
      tokenIdentifier: undefined,
      conversionOptions: undefined,
      feePolicy: undefined,
    })

    const options = new SendPaymentOptions.Bolt11Invoice({
      preferSpark: false,
      completionTimeoutSecs: 60,
    })

    const response = await sdk.sendPayment({
      prepareResponse,
      options,
      idempotencyKey: undefined,
    })

    return lightningPayResponse(response)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error("payLightningBreez error:", message)
    return { success: false, error: message }
  }
}

export const payOnchainBreez = async (
  paymentRequest: string,
  amountSats: number,
  selectedFeeType: "fast" | "medium" | "slow",
): Promise<PayResponse> => {
  try {
    const sdk = getSDKInstance()

    const prepareResponse = await sdk.prepareSendPayment({
      // 0.22.x: paymentRequest is a tagged union; Input wraps the raw string
      // (bolt11 / address / BIP-21) exactly as the SDK parsed it before.
      paymentRequest: new PaymentRequest.Input({ input: paymentRequest }),
      amount: BigInt(amountSats),
      tokenIdentifier: undefined,
      conversionOptions: undefined,
      feePolicy: undefined,
    })

    const confirmationSpeed =
      selectedFeeType === "fast"
        ? OnchainConfirmationSpeed.Fast
        : selectedFeeType === "medium"
        ? OnchainConfirmationSpeed.Medium
        : OnchainConfirmationSpeed.Slow

    const options = new SendPaymentOptions.BitcoinAddress({ confirmationSpeed })

    const response = await sdk.sendPayment({
      prepareResponse,
      options,
      idempotencyKey: undefined,
    })

    return { success: true, payment: response }
  } catch (err) {
    return {
      success: false,
      error:
        "Failed to pay the invoice. Please make sure you have enough balance to cover the payment and the network fee.",
    }
  }
}

// LNURL Payments
export const payLnurlBreez = async (
  lnurl: string,
  amountSats: number,
  memo?: string,
): Promise<LnurlPayResponse> => {
  const sdk = getSDKInstance()

  const input = await sdk.parse(lnurl)
  const payRequest = lnurlPayRequestDetailsFromInput(input)

  if (payRequest) {
    const prepareResponse = await sdk.prepareLnurlPay({
      amount: BigInt(amountSats),
      payRequest,
      comment: memo,
      validateSuccessActionUrl: true,
      tokenIdentifier: undefined,
      conversionOptions: undefined,
      feePolicy: undefined,
    })

    // ENG-711: nothing has been sent until lnurlPay runs. Every error above
    // passes through as it is, as does the plain "Unsupported input type"
    // below, and Confirm re-arms on it. A rejection from lnurlPay itself can
    // come after the SSP already has the payment, and the call carries no
    // idempotency key, so a retry would pay a fresh invoice a second time. It
    // is rethrown as LnurlPayOutcomeUnknownError, which keeps Confirm
    // disarmed. Keep this try around lnurlPay alone: widened over the steps
    // above, it disarms on refusals that sent nothing. And never catch the
    // error it throws to rethrow a plain Error: that brings the double pay
    // back.
    let response: LnurlPayResponse
    try {
      response = await sdk.lnurlPay({
        prepareResponse,
        idempotencyKey: undefined,
      })
    } catch (error) {
      const outcomeUnknown = new LnurlPayOutcomeUnknownError(error)
      // Past here the user sees only the history message, and payment_result
      // records a plain FAILURE, so this line is the record that this send was
      // disarmed and why. Beside the SDK's own lines, it tells a lost
      // request_lightning_send answer from a harmless SSP timeout. A release
      // build sends the SDK's lines to the Spark log CSV that Settings >
      // Advanced > Export Logs shares, but console.error reaches only logcat or
      // os_log, which no user can export, so the line goes to both. A dev build
      // never writes the CSV (connectToSDK skips initLogBuffer), and there the
      // console is the record.
      //
      // The RN binding (uniffi) builds an SdkError's message from its type and
      // variant alone, so every SSP or transport failure reads
      // "SdkError.SparkError". The SDK's reason is in `inner`, a frozen
      // [string] for each variant that carries text, and is logged after the
      // message. An object `inner` logs "".
      //
      // Nothing here may throw: a throw escapes as a plain Error that re-arms
      // Confirm for a second payment. Never JSON.stringify `inner`, since some
      // carry bigints. appendLog cannot throw: it is synchronous and only
      // queues the line.
      const label = "payLnurlBreez error after dispatch:"
      const inner = (error as { inner?: unknown } | null | undefined)?.inner
      const reason = Array.isArray(inner) ? inner.join(" ") : ""
      console.error(label, outcomeUnknown.message, reason)
      appendLog("ERROR", `${label} ${outcomeUnknown.message} ${reason}`.trimEnd())
      throw outcomeUnknown
    }
    console.log("Lnurl Pay Response: ", response)

    return response
  }
  throw new Error("Unsupported input type")
}

export const lnurlWithdraw = async (
  lnurl: string,
  amountSats: number,
): Promise<{ success: boolean; error?: string }> => {
  const sdk = getSDKInstance()

  const input = await sdk.parse(lnurl)
  if (input.tag === InputType_Tags.LnurlWithdraw) {
    const response = await sdk.lnurlWithdraw({
      amountSats: BigInt(amountSats),
      withdrawRequest: input.inner[0],
      completionTimeoutSecs: 30,
    })
    console.log("lnurlWithdraw Response: ", response)
    return { success: true }
  }
  return { success: false, error: "Invalid LNURL type" }
}

export const onRedeem = async (
  lnurl: string,
  amountSats: number,
  memo: string,
): Promise<{ success: boolean; error?: string }> => {
  try {
    const sdk = getSDKInstance()

    const input = await sdk.parse(lnurl)
    if (input.tag === InputType_Tags.LnurlWithdraw) {
      const response = await sdk.lnurlWithdraw({
        amountSats: BigInt(amountSats),
        withdrawRequest: input.inner[0],
        completionTimeoutSecs: 30,
      })

      console.log(`Payment: ${JSON.stringify(response)}`)

      return { success: true }
    }

    if (input.tag === InputType_Tags.LightningAddress) {
      const prepareResponse = await sdk.prepareLnurlPay({
        amount: BigInt(amountSats),
        payRequest: input.inner[0].payRequest,
        comment: memo,
        validateSuccessActionUrl: true,
        tokenIdentifier: undefined,
        conversionOptions: undefined,
        feePolicy: undefined,
      })

      const response = await sdk.lnurlPay({
        prepareResponse,
        idempotencyKey: undefined,
      })

      console.log(`Payment: ${JSON.stringify(response)}`)

      return { success: true }
    }

    return { success: false, error: "Invalid LNURL type" }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: message }
  }
}

// Input Parsing
export const parse = async (input: string): Promise<InputType> => {
  const sdk = getSDKInstance()
  const result = await sdk.parse(input)

  return result
}

// Payment History

/** Which of the wallet's payments listPaymentsBreezSDK lists (ENG-687). */
export type BreezPaymentsFilter = {
  /**
   * Unix seconds: only payments created at or after this moment. The
   * assistant's transaction search bounds its BTC window with it; the
   * screens leave it out and list from the newest payment back.
   */
  fromTimestamp?: number
  /**
   * `bitcoin` leaves out Spark token payments, whose amount and fees are in
   * the token's base units, not sats (5 USDT is 5,000,000). The assistant
   * asks for it, since it reports every amount as sats. `all`, the default,
   * lists token payments too, as the screens always have.
   */
  assets?: "all" | "bitcoin"
}

export const listPaymentsBreezSDK = async (
  offset?: number,
  limit?: number,
  { fromTimestamp, assets = "all" }: BreezPaymentsFilter = {},
): Promise<Payment[]> => {
  const sdk = getSDKInstance()

  const response = await sdk.listPayments({
    typeFilter: undefined,
    statusFilter: undefined,
    assetFilter: assets === "bitcoin" ? new AssetFilter.Bitcoin() : undefined,
    fromTimestamp:
      fromTimestamp === undefined ? undefined : BigInt(Math.floor(fromTimestamp)),
    toTimestamp: undefined,
    offset,
    limit,
    sortAscending: undefined,
    paymentDetailsFilter: undefined,
  })

  return response.payments
}

// Event Handling
export const addEventListener = async (
  callback: (event: SdkEvent) => void,
): Promise<string> => {
  const sdk = getSDKInstance()

  const listener = {
    onEvent: async (event: SdkEvent) => {
      callback(event)
    },
  }

  return sdk.addEventListener(listener)
}

export const removeEventListener = async (listenerId: string): Promise<void> => {
  const sdk = getSDKInstance()
  await sdk.removeEventListener(listenerId)
}

// Claiming Onchain Deposits
export const listUnclaimedDeposits = async (): Promise<DepositInfo[] | undefined> => {
  try {
    const sdk = getSDKInstance()
    const response = await sdk.listUnclaimedDeposits({})
    return response.deposits
  } catch (error) {
    console.error("Failed to list unclaimed deposits:", error)
    return undefined
  }
}

export const claimDeposit = async (
  deposit: DepositInfo,
  requiredFee: bigint,
): Promise<{ success: boolean; error?: string }> => {
  const sdk = getSDKInstance()

  try {
    const claimRequest: ClaimDepositRequest = {
      txid: deposit.txid,
      vout: deposit.vout,
      maxFee: new MaxFee.Fixed({ amount: requiredFee }),
    }

    await sdk.claimDeposit(claimRequest)

    return { success: true }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.error("Failed to claim deposit:", message)

    if (message.includes("MaxDepositClaimFeeExceeded")) {
      return {
        success: false,
        error:
          "The required fee exceeds the maximum allowed. Please specify a higher maxFeeSats.",
      }
    }

    return { success: false, error: message }
  }
}

export const refundDeposit = async (
  deposit: DepositInfo,
  destinationAddress: string,
  feeRateSatPerVbyte: bigint,
): Promise<{ success: boolean; txId?: string; txHex?: string; error?: string }> => {
  const sdk = getSDKInstance()

  try {
    const response: RefundDepositResponse = await sdk.refundDeposit({
      txid: deposit.txid,
      vout: deposit.vout,
      destinationAddress,
      fee: new Fee.Rate({ satPerVbyte: feeRateSatPerVbyte }),
    })

    return {
      success: true,
      txId: response.txId,
      txHex: response.txHex,
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.error("Failed to refund deposit:", message)
    return { success: false, error: message }
  }
}

// Lightning Address (LNURL-Pay)
export const checkLightningAddressAvailable = async (
  username: string,
): Promise<boolean> => {
  const sdk = getSDKInstance()
  return sdk.checkLightningAddressAvailable({ username })
}

export const registerLightningAddress = async (
  username: string,
  description?: string,
): Promise<LightningAddressInfo> => {
  const sdk = getSDKInstance()
  return sdk.registerLightningAddress({ username, description })
}

export const getLightningAddress = async (): Promise<
  LightningAddressInfo | undefined
> => {
  const sdk = getSDKInstance()
  return sdk.getLightningAddress()
}

export const deleteLightningAddress = async (): Promise<void> => {
  const sdk = getSDKInstance()
  await sdk.deleteLightningAddress()
}
