import { API_KEY, GREENLIGHT_PARTNER_CERT, GREENLIGHT_PARTNER_KEY } from "@env"
import {
  connect,
  defaultConfig,
  fetchLightningLimits,
  fetchOnchainLimits,
  LiquidNetwork,
  listPayments,
  Payment,
  prepareReceiveOnchain,
  prepareReceivePayment,
  prepareSendPayment,
  receiveOnchain,
  ReceiveOnchainResponse,
  receivePayment,
  sendPayment,
  SendPaymentResponse,
  disconnect,
  parseInvoice,
  LnInvoice,
  preparePayOnchain,
  recommendedFees,
  RecommendedFees,
  LogEntry,
  setLogger,
  LnUrlPayResult,
  InputType,
  parse,
  InputTypeVariant,
  lnurlPay,
  LnUrlPayResultVariant,
  payOnchain,
} from "@breeztech/react-native-breez-sdk-liquid"
import * as bip39 from "bip39"
import * as Keychain from "react-native-keychain"
import { EventEmitter } from "events"
import { base64ToBytes, toMilliSatoshi } from "../conversion"
import RNFS from "react-native-fs"
import { PaymentType } from "@galoymoney/client"

const _GREENLIGHT_PARTNER_CERT: number[] = Array.from(
  base64ToBytes(GREENLIGHT_PARTNER_CERT),
)

const _GREENLIGHT_PARTNER_KEY: number[] = Array.from(
  base64ToBytes(GREENLIGHT_PARTNER_KEY),
)

const KEYCHAIN_MNEMONIC_KEY = "mnemonic_key"

// SDK events listener
export const paymentEvents = new EventEmitter()

paymentEvents.setMaxListeners(20) // Adjust the limit as needed

// Retry function
const retry = <T>(fn: () => Promise<T>, ms = 15000, maxRetries = 3) =>
  new Promise<T>((resolve, reject) => {
    let attempts = 0
    const tryFn = async () => {
      try {
        const result = await fn()
        resolve(result)
      } catch (err) {
        // eslint-disable-next-line no-plusplus
        if (++attempts >= maxRetries) {
          reject(err)
        } else {
          setTimeout(tryFn, ms)
        }
      }
    }
    tryFn()
  })

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const getMnemonic = async (): Promise<string> => {
  try {
    console.log("Looking for mnemonic in keychain")
    const credentials = await Keychain.getInternetCredentials(KEYCHAIN_MNEMONIC_KEY)
    if (credentials) {
      console.log("Mnemonic found in keychain")
      return credentials.password
    }

    // Generate mnemonic and store it in the keychain
    // For development, we use a fixed mnemonic stored in .env
    console.log("Mnemonic not found in keychain. Generating new one")
    const mnemonic = bip39.generateMnemonic(128)
    await Keychain.setInternetCredentials(
      KEYCHAIN_MNEMONIC_KEY,
      KEYCHAIN_MNEMONIC_KEY,
      mnemonic,
    )
    // console.log("Mnemonic stored in keychain:", mnemonic)
    return mnemonic
  } catch (error) {
    console.error("Error in getMnemonic: ", error)
    throw error
  }
}

export const breezHealthCheck = async (): Promise<void> => {
  //   const healthCheck = await sdk.serviceHealthCheck()
  //   console.log(`Current service status is: ${healthCheck.status}`)
  //   if (!healthCheck.status) {
  //     throw new Error("Breez service is not available")
  //   }
}

const connectToSDK = async () => {
  try {
    const mnemonic = await getMnemonic()
    const config = await defaultConfig(LiquidNetwork.MAINNET)

    await connect({ mnemonic, config })
  } catch (error) {
    console.error("Connect to Breez SDK - Liquid error: ", error)
    throw error
  }
}

export const disconnectToSDK = async () => {
  try {
    const config = await defaultConfig(LiquidNetwork.MAINNET)
    await disconnect()
    await RNFS.unlink(config.workingDir)
    breezSDKInitialized = false
    breezSDKInitializing = null
  } catch (error) {
    console.error("Disconnect error: ", error)
    throw error
  }
}

export let breezSDKInitialized = false
let breezSDKInitializing: Promise<void | boolean> | null = null

export const initializeBreezSDK = async (): Promise<boolean> => {
  if (breezSDKInitialized) {
    return false
  }

  if (breezSDKInitializing !== null) {
    return breezSDKInitializing as Promise<boolean>
  }

  breezSDKInitializing = (async () => {
    try {
      await retry(connectToSDK, 5000, 3)
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

export const fetchBreezLightningLimits = async () => {
  const lightningLimits = await fetchLightningLimits()
  console.log(`LIGHTNING LIMITS:`, lightningLimits)
  return lightningLimits
}

export const fetchBreezOnChainLimits = async () => {
  const onChainLimits = await fetchOnchainLimits()
  console.log(`ONCHAIN LIMITS: ${onChainLimits}`)
  return onChainLimits
}

export const fetchBreezFee = async (
  paymentType: PaymentType,
  invoice?: string,
  receiverAmountSat?: number,
) => {
  try {
    if (paymentType === "lightning" && !!invoice) {
      const response = await prepareSendPayment({
        invoice,
      })
      return response.feesSat
    } else if (paymentType === "onchain" && !!receiverAmountSat) {
      const response = await preparePayOnchain({
        receiverAmountSat,
      })
      return response.totalFeesSat
    } else {
      return null
    }
  } catch (err) {
    console.log("FETCH BREEZ FEE>>>>>>>>>>>", err)
    return null
  }
}

export const receivePaymentBreezSDK = async (
  payerAmountSat?: number,
  description?: string,
): Promise<LnInvoice> => {
  try {
    const currentLimits = await fetchLightningLimits()
    console.log(`Minimum amount, in sats: ${currentLimits.receive.minSat}`)
    console.log(`Maximum amount, in sats: ${currentLimits.receive.maxSat}`)

    // Set the amount you wish the payer to send, which should be within the above limits
    const prepareRes = await prepareReceivePayment({
      payerAmountSat: payerAmountSat || currentLimits.receive.minSat,
    })

    // If the fees are acceptable, continue to create the Receive Payment
    const receiveFeesSat = prepareRes.feesSat
    console.log("Receive fee in sats: ", receiveFeesSat)

    const res = await receivePayment({
      prepareRes,
      description,
    })

    const parsed = await parseInvoice(res.invoice)

    return parsed
  } catch (error) {
    console.log("Debugging the receive payment BREEZSDK", error)
    throw error
  }
}

export const sendPaymentBreezSDK = async (
  bolt11: string,
): Promise<SendPaymentResponse> => {
  try {
    const prepareSendResponse = await prepareSendPayment({
      invoice: bolt11,
    })

    // If the fees are acceptable, continue to create the Send Payment
    const receiveFeesSat = prepareSendResponse.feesSat
    console.log("Receive fee in sats", receiveFeesSat)

    const sendResponse = await sendPayment(prepareSendResponse)

    if (sendResponse.payment.status === "failed") {
      console.log("Error paying Invoice: ", sendResponse)
      throw new Error(sendResponse.payment.status)
    }
    return sendResponse
  } catch (error) {
    console.log(error)
    throw error
  }
}

export const parseInvoiceBreezSDK = async (
  paymentRequest: string,
): Promise<LnInvoice> => {
  try {
    const invoice = await parseInvoice(paymentRequest)
    return invoice
  } catch (error) {
    console.log(error)
    throw error
  }
}

export const receiveOnchainBreezSDK = async (
  amount?: number,
): Promise<ReceiveOnchainResponse> => {
  try {
    // Fetch the Onchain Receive limits
    const currentLimits = await fetchOnchainLimits()
    console.log(`Minimum amount, in sats: ${currentLimits.receive.minSat}`)
    console.log(`Maximum amount, in sats: ${currentLimits.receive.maxSat}`)

    // Set the amount you wish the payer to send, which should be within the above limits
    const prepareResponse = await prepareReceiveOnchain({
      payerAmountSat: amount || currentLimits.receive.minSat,
    })

    // If the fees are acceptable, continue to create the Onchain Receive Payment
    const receiveFeesSat = prepareResponse.feesSat
    console.log("Receive fee in sats", receiveFeesSat)

    const receiveOnchainResponse = await receiveOnchain(prepareResponse)

    // Send your funds to the below bitcoin address
    const address = receiveOnchainResponse.address
    const bip21 = receiveOnchainResponse.bip21

    return receiveOnchainResponse
  } catch (error) {
    console.log(error)
    throw error
  }
}

// export const fetchReverseSwapFeesBreezSDK = async (
//   reverseSwapfeeRequest: sdk.ReverseSwapFeesRequest,
// ): Promise<sdk.ReverseSwapPairInfo> => {
//   try {
//     const fees = await sdk.fetchReverseSwapFees(reverseSwapfeeRequest)
//     console.log("min amount: ", fees.min)
//     console.log("max amount: ", fees.max)
//     return fees
//   } catch (error) {
//     console.log(error)
//     throw error
//   }
// }

export const sendOnchainBreezSDK = async (
  destinationAddress: string,
  amountSat: number,
): Promise<SendPaymentResponse> => {
  try {
    const prepareRes = await preparePayOnchain({
      receiverAmountSat: amountSat,
    })

    // Check if the fees are acceptable before proceeding
    const totalFeesSat = prepareRes.totalFeesSat

    const payOnchainRes = await payOnchain({
      address: destinationAddress,
      prepareRes,
    })

    return payOnchainRes
  } catch (error) {
    console.log(error)
    throw error
  }
}

export const recommendedFeesBreezSDK = async (): Promise<RecommendedFees> => {
  try {
    console.log("Fetching recommended fees")
    const fees = await recommendedFees()
    return fees
  } catch (error) {
    console.log(error)
    throw error
  }
}

export const payLnurlBreezSDK = async (
  lnurl: string,
  amountSat: number,
  memo: string,
): Promise<LnUrlPayResult> => {
  try {
    const input = await parse(lnurl)
    if (input.type === InputTypeVariant.LN_URL_PAY) {
      const lnUrlPayResult = await lnurlPay({
        data: input.data,
        amountMsat: amountSat * 1000,
        comment: memo,
        paymentLabel: "<label>",
        validateSuccessActionUrl: true,
      })
      console.log("Payload: ", {
        data: input.data,
        amountMsat: 1000,
        comment: memo,
        paymentLabel: "<label>",
        validateSuccessActionUrl: true,
      })
      if (lnUrlPayResult.type === LnUrlPayResultVariant.PAY_ERROR) {
        console.log("Error paying lnurl: ", lnUrlPayResult.data.reason)
        console.log("Reporting issue to Breez SDK")
        console.log("Payment hash: ", lnUrlPayResult.data.paymentHash)
        throw new Error(lnUrlPayResult.data.reason)
      }
      return lnUrlPayResult
    }
    throw new Error("Unsupported input type")
  } catch (error) {
    throw error
  }
}

export const listPaymentsBreezSDK = async (
  offset?: number,
  limit?: number,
): Promise<Payment[]> => {
  try {
    const payments = await listPayments({ offset, limit })
    return payments
  } catch (error) {
    console.log(error)
    throw error
  }
}

export const addLogListenerBreezSDK = async (): Promise<void> => {
  try {
    const onLogEntry = (l: LogEntry) => {
      console.log(`Received log [${l.level}]: ${l.line}`)
    }

    const subscription = await setLogger(onLogEntry)
  } catch (error) {
    console.log(error)
    throw error
  }
}

// export const executeDevCommandBreezSDK = async (command: string): Promise<void> => {
//   try {
//     const res = await executeDevCommand(command)
//     console.log("Executed dev command: ", res)
//   } catch (error) {
//     console.log(error)
//     throw error
//   }
// }