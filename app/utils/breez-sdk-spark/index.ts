import * as bip39 from "bip39"
import RNFS from "react-native-fs"
import * as Keychain from "react-native-keychain"
import { PaymentType } from "@galoymoney/client"
import {
  connect,
  defaultConfig,
  Network,
  Seed,
  BreezSdkInterface,
  ConnectRequest,
  ReceivePaymentMethod,
  PrepareSendPaymentRequest,
  SendPaymentResponse,
  ListPaymentsRequest,
  InputType_Tags,
  SdkEvent,
  SdkEvent_Tags,
  OnchainConfirmationSpeed,
  SendPaymentOptions,
  SendPaymentRequest,
  PrepareLnurlPayRequest,
  LnurlPayRequest,
  LnurlWithdrawRequest,
  RecommendedFees,
  Payment as SdkPayment,
  PaymentType as SdkPaymentType,
  PaymentStatus,
  PaymentDetails_Tags,
  ListUnclaimedDepositsRequest,
  ListUnclaimedDepositsResponse,
  DepositInfo,
  RefundDepositRequest,
  RefundDepositResponse,
  EventListener,
  Fee,
} from "@breeztech/breez-sdk-spark-react-native"
import { API_KEY } from "@env"
import { MoneyAmount } from "@app/types/amounts"
import { WalletCurrency } from "@app/graphql/generated"

// Re-export types for convenience
export type { RecommendedFees, SdkEvent, EventListener }
export { SdkEvent_Tags, PaymentStatus, PaymentDetails_Tags }
export { SdkPaymentType as PaymentType }

// Payment type with converted amounts
export type Payment = Omit<SdkPayment, "amount" | "fees"> & {
  amount?: number
  fees?: number
}

export const KEYCHAIN_MNEMONIC_KEY = "mnemonic_key"
const SPARK_STORAGE_DIR = `${RNFS.DocumentDirectoryPath}/spark-data`

export let breezSDKInitialized = false
let breezSDKInitializing: Promise<void | boolean> | null = null
let sparkSdk: BreezSdkInterface | null = null

const toNumber = (val: bigint | number): number => Number(val)

export const getSparkSdk = (): BreezSdkInterface => {
  if (!sparkSdk) throw new Error("Spark SDK not initialized")
  return sparkSdk
}

export const initializeBreezSDK = async (): Promise<boolean> => {
  if (breezSDKInitialized) {
    return false
  }

  if (breezSDKInitializing !== null) {
    return breezSDKInitializing as Promise<boolean>
  }

  breezSDKInitializing = (async () => {
    try {
      await retry(connectToSDK, 5000, 1)
      breezSDKInitialized = true
      return true
    } catch (error: any) {
      console.error("Failed to connect to Breez SDK after 3 attempts: ", error.message)
      throw new Error(`Failed to connect to Breez SDK after 3 attempts: ${error.message}`)
    } finally {
      breezSDKInitializing = null
    }
  })()

  return breezSDKInitializing as Promise<boolean>
}

const retry = <T>(fn: () => Promise<T>, ms = 15000, maxRetries = 3) =>
  new Promise<T>((resolve, reject) => {
    let attempts = 0
    const tryFn = async () => {
      try {
        const result = await fn()
        resolve(result)
      } catch (err) {
        if (++attempts >= maxRetries) {
          reject(err)
        } else {
          setTimeout(tryFn, ms)
        }
      }
    }
    tryFn()
  })

const connectToSDK = async () => {
  try {
    const mnemonic = await getMnemonic()
    const config = defaultConfig(Network.Mainnet)
    config.apiKey = API_KEY

    sparkSdk = await connect(
      ConnectRequest.create({
        config,
        seed: new Seed.Mnemonic({ mnemonic, passphrase: undefined }),
        storageDir: SPARK_STORAGE_DIR,
      }),
    )
  } catch (error) {
    console.error("Connect to Breez SDK - Spark error: ", error)
    throw error
  }
}

export const disconnectToSDK = async () => {
  try {
    if (breezSDKInitialized && sparkSdk) {
      await sparkSdk.disconnect()
    }

    sparkSdk = null
    breezSDKInitialized = false
    breezSDKInitializing = null
  } catch (error) {
    console.error("Disconnect error: ", error)
    throw error
  }
}

const getMnemonic = async (): Promise<string> => {
  try {
    console.log("Looking for mnemonic in keychain")
    const credentials = await Keychain.getInternetCredentials(KEYCHAIN_MNEMONIC_KEY)
    if (credentials) {
      console.log("Mnemonic found in keychain")
      return credentials.password
    }

    console.log("Mnemonic not found in keychain. Generating new one")
    const mnemonic = bip39.generateMnemonic(128)
    await Keychain.setInternetCredentials(
      KEYCHAIN_MNEMONIC_KEY,
      KEYCHAIN_MNEMONIC_KEY,
      mnemonic,
    )
    return mnemonic
  } catch (error) {
    console.error("Error in getMnemonic: ", error)
    throw error
  }
}

export const fetchRecommendedFees = async () => {
  const sdk = getSparkSdk()
  const fees: RecommendedFees = await sdk.recommendedFees()
  console.log("Recommended fees:", fees)
  const updatedFees = {
    fastestFee: toNumber(fees.fastestFee) + 3,
    halfHourFee: toNumber(fees.halfHourFee) + 1,
    hourFee: toNumber(fees.hourFee),
    economyFee: toNumber(fees.economyFee),
    minimumFee: toNumber(fees.minimumFee),
  }
  console.log("Updated recommended fees", updatedFees)
  return updatedFees
}

export const fetchBreezLightningLimits = async () => {
  console.log("LIGHTNING LIMITS: using Spark defaults")
  return {
    receive: { minSat: 1, maxSat: 100000000 },
    send: { minSat: 1, maxSat: 100000000 },
  }
}

export const fetchBreezOnChainLimits = async () => {
  console.log("ONCHAIN LIMITS: using Spark defaults")
  return {
    receive: { minSat: 1, maxSat: 100000000 },
    send: { minSat: 1, maxSat: 100000000 },
  }
}

export const fetchBreezFee = async (
  paymentType: PaymentType,
  invoice?: string,
  receiverAmountSat?: number,
  feeRateSatPerVbyte?: number,
  isSendingMax?: boolean,
) => {
  try {
    const sdk = getSparkSdk()

    if (paymentType === "lightning" && !!invoice) {
      const prepareResponse = await sdk.prepareSendPayment(
        PrepareSendPaymentRequest.create({ paymentRequest: invoice }),
      )
      return { fee: toNumber(prepareResponse.amount), err: null }
    } else if (paymentType === "onchain" && !!receiverAmountSat && !!feeRateSatPerVbyte) {
      console.log("Fee Rate Sat Per Vbyte:", feeRateSatPerVbyte)
      const prepareResponse = await sdk.prepareSendPayment(
        PrepareSendPaymentRequest.create({
          paymentRequest: invoice || "",
          amount: BigInt(receiverAmountSat),
        }),
      )
      return { fee: toNumber(prepareResponse.amount), err: null }
    } else if (
      (paymentType === "intraledger" || paymentType === "lnurl") &&
      !!invoice &&
      !!receiverAmountSat
    ) {
      const input = await sdk.parse(invoice)
      if (input.tag === InputType_Tags.LnurlPay) {
        const prepareResponse = await sdk.prepareLnurlPay(
          PrepareLnurlPayRequest.create({
            amountSats: BigInt(receiverAmountSat),
            payRequest: input.inner[0],
          }),
        )
        return { fee: toNumber(prepareResponse.feeSats), err: null }
      } else {
        return { fee: null, err: "Wrong payment type" }
      }
    } else {
      return { fee: null, err: "Wrong payment type" }
    }
  } catch (err) {
    return { fee: null, err }
  }
}

export const receivePaymentBreezSDK = async (
  payerAmountSat?: number,
  description?: string,
) => {
  try {
    const sdk = getSparkSdk()
    const currentLimits = await fetchBreezLightningLimits()
    console.log(`Minimum amount, in sats: ${currentLimits.receive.minSat}`)
    console.log(`Maximum amount, in sats: ${currentLimits.receive.maxSat}`)

    const amountSats = payerAmountSat
      ? BigInt(payerAmountSat)
      : BigInt(currentLimits.receive.minSat)

    const res = await sdk.receivePayment({
      paymentMethod: ReceivePaymentMethod.Bolt11Invoice.new({
        amountSats,
        description: description || "",
        expirySecs: undefined,
      }),
    })

    const parsed = await sdk.parse(res.paymentRequest)

    let invoiceDetails: any = {}
    if (parsed.tag === InputType_Tags.Bolt11Invoice) {
      invoiceDetails = parsed.inner[0]
    }

    return {
      ...invoiceDetails,
      destination: res.paymentRequest,
      fee: toNumber(res.fee),
    }
  } catch (error) {
    console.log("Debugging the receive payment BREEZSDK", error)
    throw error
  }
}

export const receiveOnchainBreezSDK = async (amount?: number) => {
  try {
    const sdk = getSparkSdk()
    const currentLimits = await fetchBreezOnChainLimits()
    console.log(`Minimum amount, in sats: ${currentLimits.receive.minSat}`)
    console.log(`Maximum amount, in sats: ${currentLimits.receive.maxSat}`)

    const res = await sdk.receivePayment({
      paymentMethod: ReceivePaymentMethod.BitcoinAddress.new(),
    })

    return res
  } catch (error) {
    console.log(error)
    throw error
  }
}

export const payLightningBreez = async (bolt11: string): Promise<SendPaymentResponse> => {
  try {
    const sdk = getSparkSdk()
    const prepareResponse = await sdk.prepareSendPayment(
      PrepareSendPaymentRequest.create({ paymentRequest: bolt11 }),
    )

    console.log("Send fee estimate (amount):", toNumber(prepareResponse.amount))

    const sendResponse = await sdk.sendPayment(
      SendPaymentRequest.create({ prepareResponse }),
    )

    if (sendResponse.payment.status === PaymentStatus.Failed) {
      console.log("Error paying Invoice: ", sendResponse)
      throw new Error("Payment failed")
    }
    return sendResponse
  } catch (error) {
    console.log(error)
    throw error
  }
}

export const payOnchainBreez = async (
  destinationAddress: string,
  amountSat: number,
  feeRateSatPerVbyte?: number,
  isSendingMax?: boolean,
): Promise<SendPaymentResponse> => {
  try {
    const sdk = getSparkSdk()
    const prepareResponse = await sdk.prepareSendPayment(
      PrepareSendPaymentRequest.create({
        paymentRequest: destinationAddress,
        amount: BigInt(amountSat),
      }),
    )

    const sendResponse = await sdk.sendPayment(
      SendPaymentRequest.create({
        prepareResponse,
        options: new SendPaymentOptions.BitcoinAddress({
          confirmationSpeed: OnchainConfirmationSpeed.Medium,
        }),
      }),
    )

    return sendResponse
  } catch (error) {
    console.log(error)
    throw error
  }
}

export const payLnurlBreez = async (lnurl: string, amountSat: number, memo: string) => {
  try {
    const sdk = getSparkSdk()
    const input = await sdk.parse(lnurl)

    if (input.tag === InputType_Tags.LnurlPay) {
      const prepareResponse = await sdk.prepareLnurlPay(
        PrepareLnurlPayRequest.create({
          amountSats: BigInt(amountSat),
          payRequest: input.inner[0],
          comment: memo,
        }),
      )

      const lnUrlPayResult = await sdk.lnurlPay(
        LnurlPayRequest.create({ prepareResponse }),
      )

      return lnUrlPayResult
    }
    throw new Error("Unsupported input type")
  } catch (error) {
    throw error
  }
}

export const onRedeem = async (
  lnurl: string,
  settlementAmount: MoneyAmount<WalletCurrency>,
  defaultDescription: string,
) => {
  try {
    const sdk = getSparkSdk()
    const input = await sdk.parse(lnurl)

    if (input.tag === InputType_Tags.LnurlPay) {
      const prepareResponse = await sdk.prepareLnurlPay(
        PrepareLnurlPayRequest.create({
          amountSats: BigInt(input.inner[0].minSendable),
          payRequest: input.inner[0],
        }),
      )
      const lnUrlPayResult = await sdk.lnurlPay(
        LnurlPayRequest.create({ prepareResponse }),
      )

      console.log("LNURL PAY>>>>>>>>", lnUrlPayResult)
      return { success: true, error: undefined }
    } else if (input.tag === InputType_Tags.LnurlWithdraw) {
      const lnUrlWithdrawResult = await sdk.lnurlWithdraw(
        LnurlWithdrawRequest.create({
          amountSats: settlementAmount
            ? BigInt(settlementAmount.amount)
            : BigInt(input.inner[0].minWithdrawable),
          withdrawRequest: input.inner[0],
        }),
      )
      console.log("LNURL WITHDRAW>>>>>>>>", lnUrlWithdrawResult)
      return { success: true, error: undefined }
    } else if (input.tag === InputType_Tags.LnurlAuth) {
      return { success: false, error: "LNURL Auth not supported" }
    } else {
      return { success: false, error: "Invalid invoice" }
    }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

export const parseInvoiceBreezSDK = async (paymentRequest: string) => {
  try {
    const sdk = getSparkSdk()
    const parsed = await sdk.parse(paymentRequest)

    if (parsed.tag === InputType_Tags.Bolt11Invoice) {
      return parsed.inner[0]
    }

    throw new Error("Input is not a valid bolt11 invoice")
  } catch (error) {
    console.log(error)
    throw error
  }
}

export const listPaymentsBreezSDK = async (
  offset?: number,
  limit?: number,
): Promise<Payment[]> => {
  try {
    const sdk = getSparkSdk()
    const response = await sdk.listPayments(ListPaymentsRequest.create({ offset, limit }))

    return response.payments.map((payment: any) => ({
      ...payment,
      amount: payment.amount != null ? toNumber(payment.amount) : undefined,
      fees: payment.fees != null ? toNumber(payment.fees) : undefined,
    }))
  } catch (error) {
    console.log(error)
    throw error
  }
}

export const addEventListener = async (
  listener: (event: SdkEvent) => void,
): Promise<string> => {
  const sdk = getSparkSdk()
  const eventListener: EventListener = {
    onEvent: async (event: SdkEvent) => {
      listener(event)
    },
  }
  return await sdk.addEventListener(eventListener)
}

export const removeEventListener = async (listenerId: string): Promise<boolean> => {
  const sdk = getSparkSdk()
  return await sdk.removeEventListener(listenerId)
}

export const listUnclaimedDeposits = async (): Promise<DepositInfo[]> => {
  try {
    const sdk = getSparkSdk()
    const response: ListUnclaimedDepositsResponse = await sdk.listUnclaimedDeposits(
      ListUnclaimedDepositsRequest.create({}),
    )
    return response.deposits
  } catch (error) {
    console.log("Error listing unclaimed deposits:", error)
    throw error
  }
}

export const refundDeposit = async (
  txid: string,
  vout: number,
  destinationAddress: string,
  feeRateSatPerVbyte?: number,
): Promise<RefundDepositResponse> => {
  try {
    const sdk = getSparkSdk()
    const fee = feeRateSatPerVbyte
      ? Fee.Rate.new({ satPerVbyte: BigInt(feeRateSatPerVbyte) })
      : Fee.Rate.new({ satPerVbyte: BigInt(1) })
    const response: RefundDepositResponse = await sdk.refundDeposit(
      RefundDepositRequest.create({
        txid,
        vout,
        destinationAddress,
        fee,
      }),
    )
    return response
  } catch (error) {
    console.log("Error refunding deposit:", error)
    throw error
  }
}

export type { DepositInfo, RefundDepositResponse }
