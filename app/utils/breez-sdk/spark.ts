import * as bip39 from "bip39"
import RNFS from "react-native-fs"
import { PaymentType } from "@galoymoney/client"
import * as Keychain from "react-native-keychain"
import {
  defaultConfig,
  Network,
  ReceivePaymentMethod,
  Seed,
  SdkBuilder,
  SendPaymentMethod_Tags,
  SendPaymentOptions,
  InputType_Tags,
  OnchainConfirmationSpeed,
  MaxFee,
  Fee,
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
  SendPaymentMethod,
  LnurlPayResponse,
  Payment,
} from "@breeztech/breez-sdk-spark-react-native"
import { API_KEY } from "@env"

// Constants
export const KEYCHAIN_MNEMONIC_KEY = "mnemonic_key"
const STORAGE_DIR = "breez-spark-data"

// SDK Instance Management
export let breezSDKInitialized = false
let breezSDKInitializing: Promise<boolean> | null = null
let sdkInstance: BreezSdkInterface | null = null

/**
 * Get the initialized SDK instance
 * @throws Error if SDK is not initialized
 */
export const getSDKInstance = (): BreezSdkInterface => {
  if (!sdkInstance) {
    throw new Error("Breez SDK not initialized. Call initializeBreezSDK first.")
  }
  return sdkInstance
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
      await retry(connectToSDK, 5000, 3)
      breezSDKInitialized = true
      return true
    } catch (error: unknown) {
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

const connectToSDK = async (): Promise<void> => {
  const mnemonic = await getMnemonic()

  const seed = new Seed.Mnemonic({ mnemonic, passphrase: undefined })

  const config = defaultConfig(Network.Mainnet)
  config.apiKey = API_KEY
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

    await Keychain.resetInternetCredentials(KEYCHAIN_MNEMONIC_KEY)

    const storageDir = `${RNFS.DocumentDirectoryPath}/${STORAGE_DIR}`
    if (await RNFS.exists(storageDir)) {
      await RNFS.unlink(storageDir)
    }

    breezSDKInitialized = false
    breezSDKInitializing = null
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

  return Number(info.balanceSats)
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

const extractFeeFromPaymentMethod = (
  paymentMethod: SendPaymentMethod,
  selectedFeeType?: "fast" | "medium" | "slow",
): bigint => {
  if (paymentMethod?.tag === SendPaymentMethod_Tags.Bolt11Invoice) {
    return paymentMethod.inner?.lightningFeeSats ?? BigInt(0)
  }
  if (paymentMethod?.tag === SendPaymentMethod_Tags.BitcoinAddress) {
    const feeQuote = paymentMethod.inner.feeQuote

    if (selectedFeeType === "slow")
      return feeQuote.speedSlow.userFeeSat + feeQuote.speedSlow.l1BroadcastFeeSat
    if (selectedFeeType === "medium")
      return feeQuote.speedMedium.userFeeSat + feeQuote.speedMedium.l1BroadcastFeeSat
    if (selectedFeeType === "fast")
      return feeQuote.speedFast.userFeeSat + feeQuote.speedFast.l1BroadcastFeeSat
  }
  if (paymentMethod?.tag === SendPaymentMethod_Tags.SparkAddress) {
    return paymentMethod.inner?.fee ?? BigInt(0)
  }
  if (paymentMethod?.tag === SendPaymentMethod_Tags.SparkInvoice) {
    return paymentMethod.inner?.fee ?? BigInt(0)
  }
  return BigInt(0)
}

export const fetchBreezFee = async (
  paymentType: PaymentType,
  paymentRequest?: string,
  amountSats?: bigint,
  selectedFeeType?: "fast" | "medium" | "slow",
): Promise<{ fee: number | null; err: unknown }> => {
  try {
    const sdk = getSDKInstance()

    if (paymentType === "lightning" && paymentRequest) {
      const prepareResponse = await sdk.prepareSendPayment({
        paymentRequest,
        amount: amountSats,
        tokenIdentifier: undefined,
        conversionOptions: undefined,
      })
      const fee = extractFeeFromPaymentMethod(prepareResponse.paymentMethod)
      return { fee: Number(fee), err: null }
    }

    if (paymentType === "onchain" && paymentRequest && amountSats) {
      const prepareResponse = await sdk.prepareSendPayment({
        paymentRequest,
        amount: amountSats,
        tokenIdentifier: undefined,
        conversionOptions: undefined,
      })
      const fee = extractFeeFromPaymentMethod(
        prepareResponse.paymentMethod,
        selectedFeeType,
      )
      return { fee: Number(fee), err: null }
    }

    if (
      (paymentType === "intraledger" || paymentType === "lnurl") &&
      paymentRequest &&
      amountSats
    ) {
      const parsed = await parse(paymentRequest)

      if (parsed.tag === InputType_Tags.LightningAddress) {
        const prepareResponse = await sdk.prepareLnurlPay({
          amountSats,
          payRequest: parsed.inner[0].payRequest,
          comment: undefined,
          validateSuccessActionUrl: undefined,
        })

        return { fee: Number(prepareResponse.feeSats), err: null }
      }

      return { fee: null, err: `Wrong payment type ${paymentType}: ${paymentRequest}` }
    }

    return { fee: null, err: `Wrong payment type ${paymentType}: ${paymentRequest}` }
  } catch (err) {
    return { fee: null, err }
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
    }),
  })

  return response
}

export const receiveOnchainBreez = async (): Promise<ReceivePaymentResponse> => {
  const sdk = getSDKInstance()

  const response = await sdk.receivePayment({
    paymentMethod: new ReceivePaymentMethod.BitcoinAddress(),
  })

  return response
}

// Send Payments
export const payLightningBreez = async (
  paymentRequest: string,
  amountSats?: bigint,
): Promise<SendPaymentResponse> => {
  const sdk = getSDKInstance()

  const prepareResponse = await sdk.prepareSendPayment({
    paymentRequest,
    amount: amountSats,
    tokenIdentifier: undefined,
    conversionOptions: undefined,
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

  return response
}

export const payOnchainBreez = async (
  paymentRequest: string,
  amountSats: number,
  selectedFeeType: "fast" | "medium" | "slow",
): Promise<SendPaymentResponse> => {
  const sdk = getSDKInstance()

  const prepareResponse = await sdk.prepareSendPayment({
    paymentRequest,
    amount: BigInt(amountSats),
    tokenIdentifier: undefined,
    conversionOptions: undefined,
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

  return response
}

// LNURL Payments
export const payLnurlBreez = async (
  lnurl: string,
  amountSats: number,
  memo?: string,
): Promise<LnurlPayResponse> => {
  try {
    const sdk = getSDKInstance()

    const input = await sdk.parse(lnurl)
    if (input.tag === InputType_Tags.LightningAddress) {
      const prepareResponse = await sdk.prepareLnurlPay({
        amountSats: BigInt(amountSats),
        payRequest: input.inner[0].payRequest,
        comment: memo,
        validateSuccessActionUrl: true,
      })

      const response = await sdk.lnurlPay({
        prepareResponse,
        idempotencyKey: undefined,
      })
      console.log("Lnurl Pay Response: ", response)

      return response
    }
    throw new Error("Unsupported input type")
  } catch (error) {
    throw error
  }
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

    console.log(`Payment: ${JSON.stringify(response)}`)

    return { success: true }
  }
  return { success: false, error: "Invalid LNURL type" }
}

export const onRedeem = async (
  lnurl: string,
  amountSats: bigint,
  memo: string,
): Promise<{ success: boolean; error?: string }> => {
  try {
    const sdk = getSDKInstance()

    const input = await sdk.parse(lnurl)
    if (input.tag === InputType_Tags.LnurlWithdraw) {
      const response = await sdk.lnurlWithdraw({
        amountSats,
        withdrawRequest: input.inner[0],
        completionTimeoutSecs: 30,
      })

      console.log(`Payment: ${JSON.stringify(response)}`)

      return { success: true }
    }

    if (input.tag === InputType_Tags.LightningAddress) {
      const prepareResponse = await sdk.prepareLnurlPay({
        amountSats,
        payRequest: input.inner[0].payRequest,
        comment: memo,
        validateSuccessActionUrl: true,
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
export const listPaymentsBreezSDK = async (
  offset?: number,
  limit?: number,
): Promise<Payment[]> => {
  const sdk = getSDKInstance()

  const response = await sdk.listPayments({
    typeFilter: undefined,
    statusFilter: undefined,
    assetFilter: undefined,
    fromTimestamp: undefined,
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
